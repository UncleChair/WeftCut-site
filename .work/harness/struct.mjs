// Structure dump: timeline rows, labels, all layer-ish elements.
import fs from 'node:fs'
import path from 'node:path'
import { MEDIA, PROJECTS, launchFitted } from './recorder.mjs'
import { us, sleep } from './mcp.mjs'

fs.rmSync(path.join(PROJECTS, 'Struct'), { recursive: true, force: true })
const { app, page, mcp, settle, hook } = await launchFitted({ project: 'Struct' })
const ids = {}
for (const n of ['dawn', 'mono_silent']) ids[n] = await mcp.toolId('import_media', { path: path.join(MEDIA, `${n}.mp4`) })
const tl0 = (await mcp.readResource('project://tracks'))
const aRoll = (tl0?.tracks ?? tl0).find((t) => /a.?roll/i.test(t.label ?? t.name ?? ''))
await mcp.tool('add_video_layer', { track_id: aRoll.id, media_id: ids.dawn, t_start_us: 0, t_end_us: us(6), src_in_us: 0, src_out_us: us(6) })
const overlayId = await mcp.toolId('add_track', { label: 'B-roll' })
await mcp.tool('add_video_layer', { track_id: overlayId, media_id: ids.mono_silent, t_start_us: us(2), t_end_us: us(8), src_in_us: 0, src_out_us: us(6) })
await settle()
await hook('transportSeekUs', us(0))
await sleep(800)
const dump = await page.evaluate(() => {
  const panel = document.querySelector('.weft-dock-panel[data-panel-kind="timeline"]') ?? document.body
  const rows = [...panel.querySelectorAll('[class*="track"], [class*="row"]')]
    .filter((el) => el.children.length || el.textContent.trim())
    .slice(0, 60)
    .map((el) => `${el.className.toString().slice(0, 60)} | ${el.textContent.trim().slice(0, 40)}`)
  const layers = [...document.querySelectorAll('[class*="timeline-layer"]')].map((el) => ({
    cls: el.className.toString(),
    title: el.getAttribute('title'),
  }))
  return { layers, rowsSample: rows.slice(0, 30) }
})
console.log(JSON.stringify(dump, null, 1))
await app.close()
console.log('DONE')
