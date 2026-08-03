// Dump every .timeline-layer title + y after the standard setup.
import fs from 'node:fs'
import path from 'node:path'
import { MEDIA, PROJECTS, launchFitted } from './recorder.mjs'
import { us, sleep } from './mcp.mjs'

fs.rmSync(path.join(PROJECTS, 'Titles'), { recursive: true, force: true })
const { app, page, mcp, settle, hook } = await launchFitted({ project: 'Titles' })
const ids = {}
for (const n of ['dawn', 'tide', 'ember', 'mono_silent']) ids[n] = await mcp.toolId('import_media', { path: path.join(MEDIA, `${n}.mp4`) })
const tl0 = (await mcp.readResource('project://tracks'))
const aRoll = (tl0?.tracks ?? tl0).find((t) => /a.?roll/i.test(t.label ?? t.name ?? ''))
const put = (name, tr, t0, t1) =>
  mcp.tool('add_video_layer', { track_id: tr, media_id: ids[name], t_start_us: us(t0), t_end_us: us(t1), src_in_us: 0, src_out_us: us(t1 - t0) })
await put('dawn', aRoll.id, 0, 6)
await put('tide', aRoll.id, 6, 12)
const overlayId = await mcp.toolId('add_track', { label: 'B-roll' })
await put('mono_silent', overlayId, 2, 8)
await mcp.tool('move_track', { track_id: overlayId, new_position: 3 }).catch((e) => console.log('mv fail', String(e).slice(0, 90)))
await settle()
await hook('transportSeekUs', us(0))
await sleep(800)
const info = await page.evaluate(() =>
  [...document.querySelectorAll('.timeline-layer')].map((el) => {
    const r = el.getBoundingClientRect()
    return { title: el.getAttribute('title'), y: Math.round(r.y), x: Math.round(r.x) }
  }),
)
console.log(JSON.stringify(info, null, 1))
const order = (await mcp.readResource('project://tracks'))
console.log('list order:', (order?.tracks ?? order).map((t) => t.label ?? t.name).join(' | '))
await app.close()
console.log('DONE')
