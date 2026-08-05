#!/usr/bin/env node
// Renders og-card.html to assets/og/card-{en,zh}.png at exactly 1200×630 —
// the OG/Twitter reference size — via headless Chrome or Edge, whichever this
// machine has. Re-run after editing og-card.html or the strings on it:
//   node .work/harness/og-render.mjs
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HARNESS = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HARNESS, '..', '..')
const OUT = join(ROOT, 'assets', 'og')

const browser = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
if (!browser) {
  console.error('✗ no Chrome or Edge found to render with')
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })
const page = pathToFileURL(join(HARNESS, 'og-card.html'))

for (const lang of ['en', 'zh']) {
  const out = join(OUT, `card-${lang}.png`)
  // A throwaway profile per run: the real profile may be locked by a live
  // browser, and headless refuses to share it.
  const profile = mkdtempSync(join(tmpdir(), 'og-render-'))
  const result = spawnSync(browser, [
    // Bare --headless: the `=new` spelling was retired around Chrome 132 and
    // now exits 1 with no output at all.
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1200,630',
    // Virtual time lets the webfont and the webp settle before the shot.
    '--virtual-time-budget=10000',
    `--user-data-dir=${profile}`,
    `--screenshot=${out}`,
    `${page.href}?lang=${lang}`,
  ], { stdio: 'pipe' })
  // Chrome's exit can trail a helper process that still holds the profile's
  // lockfile for a beat — Windows turns that into EBUSY. Retry briefly, and
  // give up quietly: it's a throwaway dir under %TEMP%.
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch { /* leave it to temp cleanup */ }

  if (result.status !== 0 || !existsSync(out)) {
    console.error(`✗ card-${lang}.png failed`)
    console.error(String(result.stderr))
    process.exit(1)
  }
  console.log(`✓ ${out} — ${(statSync(out).size / 1024).toFixed(0)} KB`)
}
