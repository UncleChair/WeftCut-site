#!/usr/bin/env node
// Accessibility audit — runs axe-core against a locally served page and prints
// what fails. Written because an external auditor reported a malformed
// accessibility tree one finding at a time; this finds the rest in one pass.
//
// Not wired into the build: it needs a running server and pulls axe-core from a
// CDN, neither of which belongs in `npm run dist`. The build checks structure it
// can verify offline; this checks what only a real browser can tell you.
//
//   npm start &                       # serve.mjs on :8080
//   node .work/harness/a11y.mjs http://127.0.0.1:8080/
//   node .work/harness/a11y.mjs http://127.0.0.1:8080/zh/ 1
//
// The second argument offsets the debugging port, so both locales can be
// audited concurrently without fighting over 9222.
//
// Chrome note: bare `--headless`, not `--headless=new` — the `=new` spelling was
// retired around Chrome 132 and now exits 1 silently. Same trap as og-render.mjs.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2] ?? 'http://127.0.0.1:8080/'
const PORT = 9222 + Number(process.argv[3] || 0)

const browser = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
if (!browser) {
  console.error('✗ no Chrome or Edge found to audit with')
  process.exit(1)
}

// Runs inside the page. Groups contrast failures by colour pair rather than
// listing 24 nodes, since they always come from a handful of CSS variables.
const AUDIT = `(async () => {
  if (!window.axe) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/axe-core@4/axe.min.js'
      s.onload = resolve
      s.onerror = () => reject(new Error('axe-core failed to load — offline?'))
      document.head.appendChild(s)
    })
  }
  const r = await window.axe.run(document, {
    runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
  })
  const groups = new Map()
  for (const n of r.violations.find((v) => v.id === 'color-contrast')?.nodes ?? []) {
    const d = (n.any ?? [])[0]?.data ?? {}
    const key = d.fgColor + '|' + d.bgColor + '|' + d.fontSize
    if (!groups.has(key)) {
      groups.set(key, { ratio: d.contrastRatio, needs: d.expectedContrastRatio,
                        fg: d.fgColor, bg: d.bgColor, size: d.fontSize,
                        example: n.html.slice(0, 70), count: 0 })
    }
    groups.get(key).count++
  }
  return {
    url: location.pathname,
    axe: window.axe.version,
    passes: r.passes.length,
    violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length })),
    contrast: [...groups.values()].sort((a, b) => b.count - a.count),
    incomplete: r.incomplete.map((v) => ({ id: v.id, count: v.nodes.length, help: v.help })),
    nodes: r.violations
      .filter((v) => v.id !== 'color-contrast')
      .flatMap((v) => v.nodes.map((n) => v.id + ' :: ' + n.html.slice(0, 120))),
  }
})()`

const profile = mkdtempSync(join(tmpdir(), 'a11y-'))
const chrome = spawn(browser, [
  '--headless',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1400,1000',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  url,
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function firstPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch { /* not listening yet */ }
    await sleep(500)
  }
  throw new Error('Chrome never exposed a page target')
}

const page = await firstPage()
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

let seq = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})
const evaluate = async (expression) => {
  const reply = await new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }))
  })
  const failed = reply.result?.exceptionDetails
  if (failed) throw new Error(failed.exception?.description ?? JSON.stringify(failed))
  return reply.result?.result?.value
}

try {
  for (let i = 0; i < 40; i++) {
    if ((await evaluate('document.readyState')) === 'complete') break
    await sleep(250)
  }
  // Everything below the fold is opacity:0 until the reveal observer fires. It
  // stays in the accessibility tree either way, but scrolling once means the
  // audit sees the page a visitor would.
  await evaluate('window.scrollTo(0, document.body.scrollHeight)')
  await sleep(1200)
  await evaluate('window.scrollTo(0, 0)')
  await sleep(400)

  const result = await evaluate(AUDIT)
  console.log(JSON.stringify(result, null, 2))
  const serious = result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  console.log(
    serious.length
      ? `\n✗ ${result.url} — ${serious.length} serious/critical rule(s) failing`
      : `\n✓ ${result.url} — nothing serious`
  )
} finally {
  ws.close()
  chrome.kill()
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch { /* throwaway profile under %TEMP% */ }
}
