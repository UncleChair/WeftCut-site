// AGENT DEMO — the hero recording. An external agent (this script, over MCP)
// builds a 15s brand teaser live in the UI. Cursor hidden: no human touches
// the app. Produces agent-session.mp4 + agent-log.json.
import fs from 'node:fs'
import path from 'node:path'
import {
  AGENT_LOG,
  MEDIA,
  PROJECTS,
  SHOTS,
  VIDEOS,
  launchFitted,
  startCapture,
  wakeAndVerify,
} from './recorder.mjs'
import { us, sleep } from './mcp.mjs'

fs.rmSync(path.join(PROJECTS, 'AgentDemo'), { recursive: true, force: true })
const { app, page, mcp, hook, settle, bounds } = await launchFitted({ project: 'AgentDemo' })
await settle(500)
// Show every track lane (default is A/B-roll only).
const abPill = page.locator('.weft-dock-panel[data-panel-kind="timeline"] button', { hasText: /^A\/B$/ }).first()
if (await abPill.count()) { await abPill.click(); await sleep(400) }
await wakeAndVerify(bounds, path.join(SHOTS, 'pre-flight.png'))

const out = path.join(VIDEOS, 'agent-session.mp4')
fs.mkdirSync(VIDEOS, { recursive: true })
const cap = startCapture(out, bounds, { cursor: false })
await sleep(1800) // capture warmup ≈ video t=0
const T0 = Date.now()
const mark = (label) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${label}`)

// ── Beat 1: quiet empty editor (2s) ────────────────────────────────────────
await sleep(1500)
mark('start')

// ── Beat 2: import the footage ─────────────────────────────────────────────
const ids = {}
for (const name of ['dawn', 'tide', 'ember', 'mono_silent']) {
  ids[name] = await mcp.toolId('import_media', { path: path.join(MEDIA, `${name}.mp4`) })
  mark(`import ${name}`)
  await sleep(900)
}
await settle()
await sleep(600)

// ── Beat 3: read the project, place the selects on A roll ──────────────────
const tracksRes = await mcp.readResource('project://tracks')
const trackList = tracksRes?.tracks ?? tracksRes
const aRoll = trackList.find((t) => /a.?roll/i.test(t.label ?? t.name ?? '')) ?? trackList[trackList.length - 1]
console.log('A roll:', aRoll.id)

const placed = {}
async function place(name, trackId, t0, t1, media = name) {
  const r = await mcp.tool('add_video_layer', {
    track_id: trackId, media_id: ids[media],
    t_start_us: us(t0), t_end_us: us(t1), src_in_us: 0, src_out_us: us(t1 - t0),
  })
  placed[name] = typeof r === 'string' ? { video: r } : { video: r.video_layer_id ?? r.layer_id, audio: r.audio_layer_id, group: r.group_id }
  mark(`place ${name} @${t0}-${t1}s`)
  await sleep(1300)
}
await place('dawn', aRoll.id, 0, 6)
await place('tide', aRoll.id, 6, 12)
await place('ember', aRoll.id, 12, 18)
const overlayId = await mcp.toolId('add_track', { label: 'B-roll' })
console.log('overlay track:', overlayId)
await place('mono', overlayId, 3, 9, 'mono_silent')

// ── Beat 4: tighten the cut ────────────────────────────────────────────────
const tideSplit = await mcp.tool('split_layer', { layer_id: placed.tide.video, at_t_us: us(9) })
mark('split tide @9s')
await sleep(1100)
const tideRight = tideSplit?.right ?? tideSplit?.right_id
await mcp.tool('delete_layer', { layer_id: tideRight })
mark('delete tail')
await sleep(900)
// The group-paired audio split in lockstep — the surviving 9–12s audio sliver
// would block moving ember up. Read the project back and remove it.
const st = await mcp.readResource('project://tracks')
for (const t of st?.tracks ?? st) {
  for (const l of t.layers ?? []) {
    if (l?.params?.kind === 'Audio' && l.t_start_us === us(9) && l.t_end_us === us(12)) {
      await mcp.tool('delete_layer', { layer_id: l.id })
      mark('delete orphaned audio sliver')
    }
  }
}
await sleep(900)
await mcp.tool('move_layer', { layer_id: placed.ember.video, new_track_id: aRoll.id, new_t_start_us: us(9) })
mark('move ember → 9s')
await sleep(1300)

// ── Beat 5: transitions ────────────────────────────────────────────────────
await mcp.tool('add_transition', { from_layer_id: placed.dawn.video, to_layer_id: placed.tide.video, duration_us: us(0.6), kind: 'Crossfade' })
mark('crossfade dawn→tide')
await sleep(1200)
await mcp.tool('add_transition', { from_layer_id: placed.tide.video, to_layer_id: placed.ember.video, duration_us: us(0.6), kind: 'Wipe', direction: 'left' })
mark('wipe tide→ember')
await sleep(1200)

// ── Beat 6: lower third motif ──────────────────────────────────────────────
let motifId = 'lower-third'
let motifProps = { title: 'The Coast at Dawn', subtitle: 'Agent cut — v1', accent: '#6696E6' }
try {
  const motifs = await mcp.tool('list_motifs')
  const lt = (motifs ?? []).find((m) => /lower/i.test(m.id + (m.name ?? '')))
  if (lt) motifId = lt.id
  mark(`list_motifs → ${motifId}`)
} catch { mark('list_motifs unavailable, using builtin id') }
await mcp.tool('add_motif', { motif_id: motifId, t_start_us: us(0.8), t_end_us: us(5.8), props: motifProps })
mark('add lower third')
await sleep(2500) // motif rasterizes on first render

// ── Beat 7: keyframes — B-roll fade, tide push ─────────────────────────────
const easeOut = { kind: 'EaseOut' }
await mcp.tool('set_keyframe', { layer_id: placed.mono.video, param_key: 'opacity', t_us: us(3), value: 0 })
await mcp.tool('set_keyframe', { layer_id: placed.mono.video, param_key: 'opacity', t_us: us(3.8), value: 1, interp: easeOut })
await mcp.tool('set_keyframe', { layer_id: placed.mono.video, param_key: 'opacity', t_us: us(8.2), value: 1 })
await mcp.tool('set_keyframe', { layer_id: placed.mono.video, param_key: 'opacity', t_us: us(9), value: 0, interp: easeOut })
mark('b-roll opacity fade')
await sleep(800)
await mcp.tool('set_keyframe', { layer_id: placed.tide.video, param_key: 'scale_x', t_us: us(6), value: 1 })
await mcp.tool('set_keyframe', { layer_id: placed.tide.video, param_key: 'scale_y', t_us: us(6), value: 1 })
await mcp.tool('set_keyframe', { layer_id: placed.tide.video, param_key: 'scale_x', t_us: us(9), value: 1.06, interp: { kind: 'Linear' } })
await mcp.tool('set_keyframe', { layer_id: placed.tide.video, param_key: 'scale_y', t_us: us(9), value: 1.06, interp: { kind: 'Linear' } })
mark('tide slow push')
await sleep(900)

// ── Beat 8: effect chain ───────────────────────────────────────────────────
const fxId = await mcp.toolId('add_effect', { layer_id: placed.ember.video, kind: 'blur' })
await mcp.tool('update_effect', { layer_id: placed.ember.video, effect_id: fxId, patch: { params: { strength: { mode: 'Static', value: 4 } } } })
mark('ember blur')
await sleep(1000)

// ── Beat 9: captions ───────────────────────────────────────────────────────
const srt = `1
00:00:00,600 --> 00:00:03,200
WeftCut — the agent-native editor

2
00:00:06,400 --> 00:00:09,000
Every edit lands on the timeline live

3
00:00:09,600 --> 00:00:13,000
Connect Claude, Cursor, or any MCP client
`
await mcp.tool('apply_subtitles', { body: srt })
mark('captions')
await sleep(1400)

// ── Beat 10: analysis + housekeeping ───────────────────────────────────────
try {
  const sil = await mcp.tool('detect_silences', { layer_id: placed.dawn.audio ?? placed.dawn.video })
  mark(`detect_silences → ${Array.isArray(sil) ? sil.length : 0} ranges`)
} catch (e) { mark('detect_silences: not ready (skipped)') }
await sleep(800)
await mcp.tool('add_marker', { t_us: 0, label: 'Agent cut v1', color: { r: 102, g: 150, b: 230, a: 255 } })
await mcp.tool('checkpoint', { label: 'Agent cut v1' })
mark('marker + checkpoint')
await sleep(1200)

// ── Beat 11: play the result ───────────────────────────────────────────────
await hook('transportSeekUs', us(0))
await sleep(900)
await hook('transportPlay')
mark('playback')
await sleep(15000)
await hook('transportPause').catch(() => {})
await hook('transportSeekUs', us(0)).catch(() => {})
await sleep(1200)

await cap.stop()
mark('capture stopped')

// Log with video-relative timestamps (T0 ≈ 1.8s after ffmpeg spawn).
const log = mcp.calls.map((c) => ({ ...c, t: Math.max(0, c.t - T0) }))
fs.mkdirSync(path.dirname(AGENT_LOG), { recursive: true })
fs.writeFileSync(AGENT_LOG, JSON.stringify(log, null, 2))
console.log('log entries:', log.length)
await app.close()
console.log('DONE')
