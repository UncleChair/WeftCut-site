// Topology probe: what tracks/layers exist after placing one A/V clip.
import fs from 'node:fs'
import path from 'node:path'
import { MEDIA, PROJECTS, launchFitted } from './recorder.mjs'
import { us } from './mcp.mjs'

fs.rmSync(path.join(PROJECTS, 'Topo'), { recursive: true, force: true })
const { app, mcp, settle } = await launchFitted({ project: 'Topo' })
const before = await mcp.readResource('project://tracks')
console.log('BEFORE:', JSON.stringify(before, null, 1).slice(0, 1200))
const dawn = await mcp.toolId('import_media', { path: path.join(MEDIA, 'dawn.mp4') })
await settle()
const tl = before?.tracks ?? before
const aRoll = tl.find((t) => /a.?roll/i.test(t.label ?? t.name ?? '')) ?? tl.at(-1)
console.log('placing on:', aRoll.id, aRoll.label ?? aRoll.name)
const r = await mcp.tool('add_video_layer', { track_id: aRoll.id, media_id: dawn, t_start_us: 0, t_end_us: us(6), src_in_us: 0, src_out_us: us(6) })
console.log('place result:', JSON.stringify(r))
const after = await mcp.readResource('project://tracks')
console.log('AFTER:', JSON.stringify(after, null, 1))
await app.close()
console.log('DONE')
