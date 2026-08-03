// Diagnostic: does the blade split work — OS cursor vs Playwright click?
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { HARNESS_DIR, MEDIA, PROJECTS, launchFitted } from './recorder.mjs'
import { us, sleep } from './mcp.mjs'

const run = promisify(execFile)
const mouse = (...a) => run('swift', [path.join(HARNESS_DIR, 'mouse.swift'), ...a.map(String)])

fs.rmSync(path.join(PROJECTS, 'Blade'), { recursive: true, force: true })
const { app, page, mcp, settle, bounds } = await launchFitted({ project: 'Blade' })
const dawn = await mcp.toolId('import_media', { path: path.join(MEDIA, 'dawn.mp4') })
const tl0 = (await mcp.readResource('project://tracks'))
const aRoll = (tl0?.tracks ?? tl0).find((t) => /a.?roll/i.test(t.label ?? t.name ?? ''))
await mcp.tool('add_video_layer', { track_id: aRoll.id, media_id: dawn, t_start_us: 0, t_end_us: us(6), src_in_us: 0, src_out_us: us(6) })
await settle()
await sleep(600)

const info = async (tag) => {
  const out = await page.evaluate(() => ({
    blade: !!document.querySelector('.timeline-root-blade, [class*="blade"]'),
    bladePreview: !!document.querySelector('[data-testid="timeline-blade-preview"]'),
    layers: document.querySelectorAll('.timeline-layer').length,
    active: document.activeElement?.tagName + '.' + (document.activeElement?.className?.toString().slice(0, 40) ?? ''),
  }))
  console.log(tag, JSON.stringify(out))
}
await info('initial')

// press c, watch blade class
await page.keyboard.press('c')
await sleep(500)
await info('after-c')

// Playwright click on the clip center
const clip = page.locator('.timeline-layer[title^="VideoClip:"]').first()
const b = await clip.boundingBox()
console.log('clip box:', JSON.stringify(b))
await page.mouse.click(b.x + b.width * 0.5, b.y + b.height / 2)
await sleep(700)
await info('after-pw-click')

// undo, try swift click
await page.keyboard.press('Meta+z')
await sleep(500)
await page.keyboard.press('c')
await sleep(400)
await mouse('click', bounds.x + b.x + b.width * 0.5, bounds.y + b.y + b.height / 2)
await sleep(700)
await info('after-swift-click')

const layers = (await mcp.readResource('project://tracks'))
console.log('final layer count:', (layers?.tracks ?? layers).map((t) => (t.layers ?? []).length).join(','))
await app.close()
console.log('DONE')
