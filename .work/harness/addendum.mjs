// Addendum shots: export dialog on the Video tab (codec grid, no paths) +
// chroma-key eyedropper overlay with ember selected.
import fs from 'node:fs'
import path from 'node:path'
import { launchFitted, MEDIA, PROJECTS, SHOTS } from './recorder.mjs'
import { us, sleep } from './mcp.mjs'

fs.rmSync(path.join(PROJECTS, 'Addendum'), { recursive: true, force: true })
const { app, page, mcp, settle, hook } = await launchFitted({ project: 'Addendum' })

const ids = {}
for (const n of ['dawn', 'tide', 'ember']) ids[n] = await mcp.toolId('import_media', { path: path.join(MEDIA, `${n}.mp4`) })
const tl0 = (await mcp.readResource('project://tracks'))
const aRoll = (tl0?.tracks ?? tl0).find((t) => /a.?roll/i.test(t.label ?? t.name ?? ''))
const put = (name, t0, t1) => mcp.tool('add_video_layer', { track_id: aRoll.id, media_id: ids[name], t_start_us: us(t0), t_end_us: us(t1), src_in_us: 0, src_out_us: us(t1 - t0) })
await put('dawn', 0, 6)
await put('tide', 6, 12)
const emberR = await put('ember', 12, 17)
const emberId = typeof emberR === 'string' ? emberR : emberR.video_layer_id ?? emberR.layer_id
const blurId = await mcp.toolId('add_effect', { layer_id: emberId, kind: 'blur' })
await mcp.tool('update_effect', { layer_id: emberId, effect_id: blurId, patch: { params: { strength: { mode: 'Static', value: 6 } } } })
await mcp.toolId('add_effect', { layer_id: emberId, kind: 'chromakey' })
await settle()
await hook('transportSeekUs', us(13))
await sleep(600)

// ember selected (last clip), Effect tab forward
await page.locator('.timeline-layer[title^="VideoClip:"]').nth(2).click({ position: { x: 8, y: 24 } }).catch(() => {})
await sleep(500)
await page.locator('.weft-dock-tab-label', { hasText: 'Effect' }).first().click().catch(() => {})
await sleep(800)
await page.screenshot({ path: path.join(SHOTS, 'effects.png') })

// eyedropper overlay
const pick = page.locator('[data-testid^="effect-colorpick-"]').first()
if (await pick.count()) {
  await pick.click()
  await sleep(700)
  await page.mouse.move(500, 260, { steps: 12 })
  await sleep(700)
  await page.screenshot({ path: path.join(SHOTS, 'eyedropper.png') })
  await page.keyboard.press('Escape')
  await sleep(400)
} else console.log('no colorpick button')

// export dialog on the Video tab
await page.keyboard.press('Meta+e')
await sleep(1500)
await page.locator('#export-tab-video').click().catch(() => {})
await sleep(700)
await page.screenshot({ path: path.join(SHOTS, 'export.png') })
await page.keyboard.press('Escape')
await app.close()
console.log('DONE')
