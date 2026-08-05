#!/usr/bin/env node
// WeftCut site — Markdown alternates of the shipped HTML.
//
// Agents that send `Accept: text/markdown` get these instead of the page (see
// worker.js). Cloudflare's own Markdown for Agents would do the conversion at
// the edge, but it explicitly does not cover Workers static assets, which is
// all this site is — so the conversion happens here, at build time, and ships
// as two more static files.
//
// The converter is deliberately small and deliberately strict: it knows the
// handful of elements index.html actually uses and throws on anything else, so
// a new element in the markup fails the build instead of silently vanishing
// from what agents read. Same bargain as build-dist.mjs's link check.
//
//   node build-md.mjs            # generate
//   node build-md.mjs --check    # verify the committed output is current
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const CHECK = process.argv.includes('--check')
const ORIGIN = 'https://weftcut.com'

const PAGES = [
  { html: 'index.html', md: 'index.md' },
  { html: join('zh', 'index.html'), md: join('zh', 'index.md') },
]

// --- parse ------------------------------------------------------------------
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

// Whole subtrees that carry no reading content: behaviour, styling, decoration,
// and the two <video> players whose <source> files an agent can't watch anyway.
const DROP = new Set(['script', 'style', 'svg', 'noscript', 'template', 'video'])

const TOKEN =
  /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>`]+))?)*)\s*(\/?)>|([^<]+)/g

const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ensp: ' ', emsp: ' ', thinsp: ' ',
  mdash: '—', ndash: '–', middot: '·', hellip: '…',
  times: '×', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', deg: '°',
}

const decode = (s) =>
  s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return body in ENTITIES ? ENTITIES[body] : whole
  })

function parseAttrs(raw) {
  const out = {}
  if (!raw) return out
  for (const m of raw.matchAll(ATTR)) {
    out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}

function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [] }
  const stack = [root]
  const top = () => stack[stack.length - 1]

  for (const m of html.matchAll(TOKEN)) {
    const [whole, closeTag, openTag, rawAttrs, selfClose, text] = m
    if (whole.startsWith('<!--')) continue

    if (text != null) {
      top().children.push({ tag: '#text', value: decode(text) })
      continue
    }

    if (closeTag) {
      const tag = closeTag.toLowerCase()
      // Unwind to the matching open tag. Anything still on the stack above it
      // was left unclosed in the source; dropping it here mirrors what a real
      // parser does rather than derailing the rest of the document.
      const at = stack.map((n) => n.tag).lastIndexOf(tag)
      if (at > 0) stack.length = at
      continue
    }

    const tag = openTag.toLowerCase()
    const node = { tag, attrs: parseAttrs(rawAttrs), children: [] }
    top().children.push(node)
    if (!selfClose && !VOID.has(tag)) stack.push(node)
  }
  return root
}

// --- render -----------------------------------------------------------------
// Inline elements collapse into the surrounding line; block elements are
// separated by a blank line. Anything not named in either table is an error.
const INLINE = new Set([
  'a', 'em', 'i', 'strong', 'b', 'code', 'span', 'br', 'img', 'small',
  'sup', 'sub', 'abbr', 'time', 'kbd', 'u', 's',
])

const BLOCK = new Set([
  'html', 'body', 'main', 'div', 'section', 'article', 'header', 'footer',
  'aside', 'nav', 'figure', 'figcaption', 'p', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'hr', 'button', 'dl', 'dt',
  'dd', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'head', 'title',
])

const absolute = (url) => (url && url.startsWith('/') ? ORIGIN + url : url)

// Markdown's structural characters, escaped only where they'd start a
// construct: mid-sentence asterisks and underscores in prose are left alone.
const escapeText = (s) => s.replace(/([\\`*_[\]])/g, '\\$1')

// Two <span>s written flush against each other — `<span>a</span><span>b</span>`
// — are two visually separate labels that CSS pulls apart (the section kickers
// and figure captions are both built this way). Without a space here their
// text runs together into "Opening SceneOne shot".
const needsGap = (prev, next) =>
  prev != null && prev.tag === 'span' && next.tag === 'span'

class Renderer {
  constructor(label) {
    this.label = label
    this.problems = []
  }

  /** Render children as one inline run. */
  inline(node) {
    let out = ''
    let prev = null
    for (const child of node.children) {
      if (child.tag === '#text') {
        out += escapeText(child.value.replace(/\s+/g, ' '))
        prev = child
        continue
      }
      if (DROP.has(child.tag)) continue
      if (needsGap(prev, child)) out += ' '
      out += this.inlineElement(child)
      prev = child
    }
    return out
  }

  inlineElement(node) {
    const inner = this.inline(node)
    switch (node.tag) {
      case 'br':
        return '\n'
      case 'img': {
        const src = absolute(node.attrs.src)
        // A decorative image — empty alt, or explicitly hidden — is chrome. It
        // has nothing to tell a reader who can't see it, including an agent.
        if (!src || !node.attrs.alt || node.attrs['aria-hidden'] === 'true') return ''
        return `![${escapeText(node.attrs.alt)}](${src})`
      }
      case 'a': {
        const href = absolute(node.attrs.href)
        const text = inner.trim() || escapeText(node.attrs['aria-label'] || '')
        if (!text) return ''
        return href ? `[${text}](${href})` : text
      }
      case 'em':
      case 'i':
        return inner.trim() ? `*${inner.trim()}*` : ''
      case 'strong':
      case 'b':
        return inner.trim() ? `**${inner.trim()}**` : ''
      case 'code':
      case 'kbd':
        return inner.trim() ? `\`${inner.trim().replace(/\\([\\`*_[\]])/g, '$1')}\`` : ''
      default:
        return inner
    }
  }

  /** Render a node as a list of block-level markdown chunks. */
  blocks(node, depth = 0) {
    const out = []
    // Text sitting directly between block children is whitespace in this
    // document; a stray word here would be a markup bug worth seeing.
    let pending = ''
    const flush = () => {
      if (pending.trim()) out.push(pending.trim())
      pending = ''
    }

    let prev = null
    for (const child of node.children) {
      if (child.tag === '#text') {
        pending += escapeText(child.value.replace(/\s+/g, ' '))
        prev = child
        continue
      }
      if (DROP.has(child.tag)) continue

      if (INLINE.has(child.tag)) {
        if (needsGap(prev, child)) pending += ' '
        pending += this.inlineElement(child)
        prev = child
        continue
      }
      flush()
      prev = child

      if (!BLOCK.has(child.tag)) {
        this.problems.push(`${this.label}: unhandled element <${child.tag}>`)
        continue
      }
      out.push(...this.block(child, depth))
    }
    flush()
    return out
  }

  block(node, depth) {
    const tag = node.tag
    if (tag === 'hr') return ['---']

    if (/^h[1-6]$/.test(tag)) {
      const text = this.inline(node).trim()
      return text ? ['#'.repeat(Number(tag[1])) + ' ' + text] : []
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = node.children.filter((c) => c.tag === 'li')
      const lines = items.map((li, i) => {
        const marker = tag === 'ol' ? `${i + 1}. ` : '- '
        const pad = ' '.repeat(marker.length)
        const body = this.blocks(li, depth + 1).join('\n\n')
        // Continuation lines indent to the marker so nested blocks stay inside
        // the item rather than terminating the list.
        return marker + body.split('\n').join('\n' + pad)
      })
      return lines.length ? [lines.join('\n')] : []
    }

    if (tag === 'blockquote') {
      const body = this.blocks(node, depth).join('\n\n')
      return body ? [body.split('\n').map((l) => '> ' + l).join('\n')] : []
    }

    if (tag === 'pre') {
      const text = node.children.map(collectText).join('')
      return text.trim() ? ['```\n' + text.replace(/^\n+|\n+$/g, '') + '\n```'] : []
    }

    if (tag === 'figcaption') {
      const text = this.inline(node).trim()
      return text ? [`*${text}*`] : []
    }

    if (tag === 'button') {
      // Not actionable in a markdown read, but the label is often the only
      // place a state like "Coming soon" is written down.
      const text = this.inline(node).trim()
      return text ? [`\`[${text}]\``] : []
    }

    if (tag === 'p' || tag === 'dt' || tag === 'dd' || tag === 'th' || tag === 'td') {
      const text = this.inline(node).trim()
      return text ? [text] : []
    }

    // Everything else is a container: transparent, contributes no syntax.
    return this.blocks(node, depth)
  }
}

const collectText = (node) =>
  node.tag === '#text' ? node.value : node.children.map(collectText).join('')

function convert(html, label) {
  const doc = parse(html)
  const body = find(doc, 'body')
  if (!body) throw new Error(`${label}: no <body>`)

  const renderer = new Renderer(label)
  const chunks = renderer.blocks(body)
  if (renderer.problems.length) return { problems: renderer.problems }

  const text = chunks
    .join('\n\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { text: text + '\n', problems: [] }
}

function find(node, tag) {
  if (node.tag === tag) return node
  for (const child of node.children || []) {
    const hit = find(child, tag)
    if (hit) return hit
  }
  return null
}

// --- run --------------------------------------------------------------------
const problems = []
let exitCode = 0

for (const page of PAGES) {
  const source = join(ROOT, page.html)
  if (!existsSync(source)) {
    problems.push(`missing source: ${page.html}`)
    continue
  }
  const label = page.html.replaceAll('\\', '/')
  const { text, problems: bad } = convert(readFileSync(source, 'utf8'), label)
  if (bad.length) {
    problems.push(...bad)
    continue
  }

  const out = join(ROOT, page.md)
  const name = page.md.replaceAll('\\', '/')
  if (CHECK) {
    const current = existsSync(out) ? readFileSync(out, 'utf8') : null
    if (current !== text) {
      console.error(`✗ ${name} is stale — run \`node build-md.mjs\``)
      exitCode = 1
    } else {
      console.log(`✓ ${name} is current`)
    }
  } else {
    writeFileSync(out, text)
    console.log(`✓ wrote ${name} (${(Buffer.byteLength(text) / 1024).toFixed(1)} KB)`)
  }
}

if (problems.length) {
  console.error(`✗ markdown: ${problems.length} problem(s)`)
  for (const p of problems) console.error('   ' + p)
  process.exit(1)
}
process.exit(exitCode)
