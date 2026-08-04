#!/usr/bin/env node
// WeftCut site — localized page generator.
//
// index.html is the single source of structure AND the English copy. This reads
// it, swaps every string listed in i18n/<locale>.json, rewrites the head for the
// target language, and writes <locale>/index.html. Both files ship as plain
// static HTML: no client-side i18n, so crawlers that don't run JS — which is
// most LLM crawlers — still see fully translated markup.
//
// Keys are the English source text itself, so index.html needs no annotation and
// an English copy edit invalidates its key. That's deliberate: the build fails
// and names the string whose translation went stale.
//
//   node build-i18n.mjs            # generate
//   node build-i18n.mjs --check    # verify the committed output is current
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const SOURCE = join(ROOT, 'index.html')
const LOCALES = ['zh']
const CHECK = process.argv.includes('--check')

const problems = []
const fail = (msg) => problems.push(msg)

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Source text is indented and line-wrapped inside index.html, so a key written
// with single spaces has to match a newline plus leading indentation too.
const flexibleWhitespace = (s) =>
  escapeRe(s).replace(/\s+/g, '\\s+')

/**
 * Replace an element's inner HTML. Anchoring on `>` … `<` is what lets this
 * work without a DOM: an element's content always sits between the close of its
 * open tag and the open of its close tag, so the anchors can't match a
 * fragment of some longer run of text.
 */
function replaceHtml(doc, en, zh, label) {
  const re = new RegExp('>(\\s*)' + flexibleWhitespace(en) + '(\\s*)<', 'g')
  let hits = 0
  const out = doc.replace(re, (_m, lead, tail) => {
    hits++
    return '>' + lead + zh + tail + '<'
  })
  if (hits === 0) fail(`${label}: no match for html key — ${JSON.stringify(en.slice(0, 72))}`)
  return out
}

function replaceAttr(doc, en, zh, label) {
  const re = new RegExp('="' + flexibleWhitespace(en) + '"', 'g')
  let hits = 0
  const out = doc.replace(re, () => {
    hits++
    return '="' + zh + '"'
  })
  if (hits === 0) fail(`${label}: no match for attr key — ${JSON.stringify(en.slice(0, 72))}`)
  return out
}

/** Swap one <meta property|name="…" content="…"> value by its key. */
function setMeta(doc, attr, key, value) {
  const re = new RegExp(`(<meta ${attr}="${escapeRe(key)}" content=")[^"]*(")`)
  if (!re.test(doc)) {
    fail(`head: no <meta ${attr}="${key}"> to rewrite`)
    return doc
  }
  return doc.replace(re, `$1${value}$2`)
}

function buildLocale(locale) {
  const dict = JSON.parse(readFileSync(join(ROOT, 'i18n', `${locale}.json`), 'utf8'))
  const cfg = dict.locale
  let doc = readFileSync(SOURCE, 'utf8')

  // --- body + head text ---------------------------------------------------
  for (const [en, zh] of Object.entries(dict.html)) doc = replaceHtml(doc, en, zh, locale)
  for (const [en, zh] of Object.entries(dict.attrs)) doc = replaceAttr(doc, en, zh, locale)
  // JSON-LD strings are JSON values, not attributes — quoted, but not `="…"`.
  for (const [en, zh] of Object.entries(dict.jsonld)) {
    const re = new RegExp('"' + flexibleWhitespace(en) + '"', 'g')
    if (!re.test(doc)) fail(`${locale}: no match for jsonld key — ${JSON.stringify(en.slice(0, 72))}`)
    doc = doc.replace(re, JSON.stringify(zh))
  }

  // --- language + canonical -----------------------------------------------
  doc = doc.replace(/<html lang="[^"]*">/, `<html lang="${cfg.lang}">`)
  doc = doc.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${cfg.url}" />`
  )
  doc = setMeta(doc, 'property', 'og:url', cfg.url)
  doc = setMeta(doc, 'property', 'og:locale', cfg.ogLocale)
  doc = setMeta(doc, 'property', 'og:locale:alternate', cfg.ogLocaleAlternate)

  // hreflang stays identical on every page by design — each language declares
  // the whole set including itself — so it needs no rewriting here.

  // Tell schema.org consumers which language this page is in.
  doc = doc.replace(
    /("@type": "SoftwareApplication",)/,
    `$1\n  "inLanguage": "${cfg.lang}",`
  )

  // --- language switcher ---------------------------------------------------
  // Flip every marked anchor to point back at the language it came from. Only
  // attributes are rewritten, so the nav's globe icon survives untouched; the
  // footer's worded link has its text swapped because its content is a bare
  // text node. `\slang=` can't match inside `hreflang=` — no space before it.
  let switches = 0
  doc = doc.replace(
    /<a\b([^>]*\sdata-lang-switch\b[^>]*)>([\s\S]*?)<\/a>/g,
    (_m, attrs, inner) => {
      switches++
      const next = attrs
        .replace(/\shref="[^"]*"/, ` href="${cfg.switchHref}"`)
        .replace(/\shreflang="[^"]*"/, ` hreflang="${cfg.switchLang}"`)
        .replace(/\slang="[^"]*"/, ` lang="${cfg.switchLang}"`)
        .replace(/\saria-label="[^"]*"/, ` aria-label="${cfg.switchAria}"`)
        .replace(/\stitle="[^"]*"/, ` title="${cfg.switchTitle}"`)
      return `<a${next}>${inner.includes('<') ? inner : cfg.switchLabel}</a>`
    }
  )
  if (switches === 0) fail(`${locale}: no data-lang-switch anchors found`)

  // --- runtime UI strings --------------------------------------------------
  const uiRe = /(<script type="application\/json" id="ui-strings">\n)[\s\S]*?(\n<\/script>)/
  if (!uiRe.test(doc)) fail(`${locale}: no #ui-strings block to rewrite`)
  doc = doc.replace(uiRe, (_m, open, close) => open + JSON.stringify(dict.ui, null, 2) + close)

  return doc
}

// Flag English that slipped through. Brand names, formats and CLI tokens are
// meant to stay as they are; anything else here is an untranslated string.
const KEEP = new RegExp(
  '^(?:' +
    [
      'WeftCut', 'GitHub', 'MCP', 'Claude', 'Cursor', 'Codex', 'FFmpeg', 'MIT',
      'macOS', 'Windows', 'Linux', 'agent-session\\.json', 'claude · weftcut',
      'Motif', 'AI', 'Agent', 'agent', 'English', 'IN', 'CUT', 'FX', 'EDIT',
      'END', 'FAQ', 'A/B', 'H\\.264', 'HEVC', 'AV1', 'ProRes', 'DNxHR', 'SRT',
      'VTT', 'ASS', 'Ctrl-K', 'WEFTCUT', 'AGENT', 'SCENE', 'T\\+',
      // Deliberately left in English: a terminal's own title bar, and the
      // platform names, which aren't translated in Chinese either.
      'claude &middot; weftcut', 'macOS · Windows · Linux',
    ].join('|') +
    ')$'
)

function findLeftoverEnglish(doc) {
  const body = doc
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  const out = []
  for (const m of body.matchAll(/>([^<>]+)</g)) {
    const text = m[1].replace(/\s+/g, ' ').trim()
    if (!text || !/[A-Za-z]{2}/.test(text)) continue
    if (/[一-鿿]/.test(text)) continue
    if (KEEP.test(text)) continue
    out.push(text)
  }
  return [...new Set(out)]
}

let exitCode = 0
for (const locale of LOCALES) {
  const generated = buildLocale(locale)
  const outDir = join(ROOT, locale)
  const outFile = join(outDir, 'index.html')

  if (problems.length) {
    console.error(`✗ ${locale}: ${problems.length} problem(s)`)
    for (const p of problems) console.error('   ' + p)
    process.exit(1)
  }

  const leftovers = findLeftoverEnglish(generated)
  if (leftovers.length) {
    console.warn(`! ${locale}: ${leftovers.length} untranslated run(s) left in the output:`)
    for (const l of leftovers) console.warn('   ' + JSON.stringify(l))
  }

  if (CHECK) {
    const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : null
    if (current !== generated) {
      console.error(`✗ ${locale}/index.html is stale — run \`node build-i18n.mjs\``)
      exitCode = 1
    } else {
      console.log(`✓ ${locale}/index.html is current`)
    }
  } else {
    mkdirSync(outDir, { recursive: true })
    writeFileSync(outFile, generated)
    const kb = (Buffer.byteLength(generated) / 1024).toFixed(1)
    console.log(`✓ wrote ${locale}/index.html (${kb} KB)`)
  }
}
process.exit(exitCode)
