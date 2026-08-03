// SCREENSHOTS — build the demo project, then capture 2x stills of every key
// surface. Output: .work/shots/*.png
import fs from 'node:fs'
import path from 'node:path'
import { MEDIA, PROJECTS, SHOTS, launchFitted } from './recorder.mjs'
import { us, sleep } from './mcp.mjs'

fs.mkdirSync(SHOTS, { recursive: true })

fs.rmSync(path.join(PROJECTS, 'Stills'), { recursive: true, force: true })
const { app, page, mcp, hook, settle, invoke } = await launchFitted({ project: 'Stills' })

// ── Setup (same story as the tour, plus chroma key) ───────────────────────
const ids = {}
for (const n of ['dawn', 'tide', 'ember', 'mono_silent']) ids[n] = await mcp.toolId('import_media', { path: path.join(MEDIA, `${n}.mp4`) })
const tracksRes = await mcp.readResource('project://tracks')
const trackList = tracksRes?.tracks ?? tracksRes
const aRoll = trackList.find((t) => /a.?roll/i.test(t.label ?? t.name ?? '')) ?? trackList.at(-1)
const put = (name, tr, t0, t1, srcIn = 0) =>
  mcp.tool('add_video_layer', { track_id: tr, media_id: ids[name], t_start_us: us(t0), t_end_us: us(t1), src_in_us: us(srcIn), src_out_us: us(srcIn + (t1 - t0)) })
const dawnR = await put('dawn', aRoll.id, 0, 6)
const tideR = await put('tide', aRoll.id, 6, 12)
const emberR = await put('ember', aRoll.id, 12, 17, 2)
const bRoll = await mcp.toolId('add_track', { label: 'B-roll' })
const monoR = await put('mono_silent', bRoll, 2, 8)
const lid = (r) => (typeof r === 'string' ? r : r.video_layer_id ?? r.layer_id)
const emberId = lid(emberR)
const monoId = lid(monoR)
let motifId = 'lower-third'
try {
  const motifs = await mcp.tool('list_motifs')
  const lt = (motifs ?? []).find((m) => /lower/i.test(m.id + (m.name ?? '')))
  if (lt) motifId = lt.id
} catch {}
await mcp.tool('add_motif', { motif_id: motifId, t_start_us: us(1), t_end_us: us(5), props: { title: 'The Coast at Dawn', subtitle: 'WeftCut', accent: '#6696E6' } })
const mk = (t, v, interp) => mcp.tool('set_keyframe', { layer_id: monoId, param_key: 'opacity', t_us: us(t), value: v, ...(interp ? { interp } : {}) })
await mk(2, 0); await mk(3, 1, { kind: 'EaseOut' }); await mk(7, 1); await mk(8, 0, { kind: 'EaseIn' })
await mcp.tool('apply_subtitles', { body: '1\n00:00:01,000 --> 00:00:03,500\nA real timeline, frame-accurate\n\n2\n00:00:06,000 --> 00:00:09,000\nKeyframes, effects, captions, audio\n' })
await mcp.tool('add_transition', { from_layer_id: lid(dawnR), to_layer_id: lid(tideR), duration_us: us(0.6), kind: 'Crossfade' })
const blurId = await mcp.toolId('add_effect', { layer_id: emberId, kind: 'blur' })
await mcp.tool('update_effect', { layer_id: emberId, effect_id: blurId, patch: { params: { strength: { mode: 'Static', value: 6 } } } })
const ckId = await mcp.toolId('add_effect', { layer_id: emberId, kind: 'chromakey' })
await mcp.tool('add_marker', { t_us: us(6), label: 'Verse 2', color: { r: 250, g: 204, b: 21, a: 255 } })
await settle()
// Show every track lane (default is A/B-roll only) for the timeline stills.
const abPill = page.locator('.weft-dock-panel[data-panel-kind="timeline"] button', { hasText: /^A\/B$/ }).first()
if (await abPill.count()) { await abPill.click(); await sleep(400) }
console.log('setup complete')

const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
const shotEl = async (name, sel) => {
  const el = page.locator(sel).first()
  await el.waitFor({ state: 'visible', timeout: 10_000 })
  await el.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

// 1. Hero: full editor, playhead where motif + caption are visible
await hook('transportSeekUs', us(2.2))
await sleep(1200)
await shot('editor-hero')

// give the timeline room before its closeup
try {
  const panelTop = (await page.locator('.weft-dock-panel[data-panel-kind="timeline"]').boundingBox())?.y
  const sashes = page.locator('.dv-sash')
  const sn = await sashes.count()
  for (let i = 0; i < sn; i++) {
    const b = await sashes.nth(i).boundingBox()
    if (b && panelTop && b.width > 600 && b.height < 12 && b.y < panelTop && panelTop - b.y < 30) {
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      await page.mouse.down()
      await page.mouse.move(b.x + b.width / 2, b.y - 150, { steps: 20 })
      await page.mouse.up()
      await sleep(700)
      break
    }
  }
} catch {}

// 2. Timeline closeup with keyframe lanes expanded on the row that HAS keys
try {
  const twirls = page.locator('[data-testid="kf-lane-twirl"]:not([disabled])')
  const n = await twirls.count()
  for (let i = 0; i < n; i++) {
    await twirls.nth(i).click().catch(() => {})
    await sleep(500)
    if ((await page.locator('.kf-diamond.kf-sublane-diamond').count()) > 0) break
    await twirls.nth(i).click().catch(() => {}) // collapse, try next
  }
  const dia = page.locator('.kf-diamond.kf-sublane-diamond').nth(1)
  if (await dia.count()) { await dia.click().catch(() => {}); await sleep(500) }
  await shotEl('timeline-closeup', '.weft-dock-panel[data-panel-kind="timeline"]')
  await shot('curve-editor')
} catch (e) { console.log('timeline shots fail:', String(e).slice(0, 90)) }

// 3. Effects: select ember, bring Effect tab forward
try {
  await page.locator('.timeline-layer[title^="VideoClip:"]').nth(2).click().catch(() => {})
  await sleep(500)
  await page.locator('.weft-dock-tab-label', { hasText: 'Effect' }).first().click().catch(() => {})
  await sleep(700)
  await shot('effects')
} catch (e) { console.log('effects shot fail:', String(e).slice(0, 90)) }

// 4. Eyedropper overlay (chroma key colorpick)
try {
  const pick = page.locator('[data-testid^="effect-colorpick-"]').first()
  if (await pick.count()) {
    await pick.click()
    await sleep(600)
    await page.mouse.move(640, 300)
    await sleep(600)
    await shot('eyedropper')
    await page.keyboard.press('Escape')
    await sleep(400)
  }
} catch (e) { console.log('eyedropper fail:', String(e).slice(0, 90)) }

// 5. Search palette
try {
  await page.keyboard.press('Meta+k')
  await sleep(800)
  await page.keyboard.type('lower', { delay: 70 })
  await sleep(900)
  await shot('search-palette')
  await page.keyboard.press('Escape')
  await sleep(500)
} catch (e) { console.log('palette fail:', String(e).slice(0, 90)) }

// 6. Export dialog
try {
  await page.keyboard.press('Meta+e')
  await sleep(1500)
  await shot('export')
  await page.keyboard.press('Escape')
  await sleep(600)
} catch (e) { console.log('export fail:', String(e).slice(0, 90)) }

// 7. Motif picker (Insert → Motifs…)
try {
  await page.locator('.menu-trigger').nth(3).click()
  await sleep(500)
  await page.locator('.app-menu-item', { hasText: 'Motifs' }).first().click()
  await page.locator('.motif-picker').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  await page.locator('.motif-preview-host img').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await sleep(800)
  await shot('motifs')
  await page.keyboard.press('Escape')
  await sleep(500)
} catch (e) { console.log('motifs fail:', String(e).slice(0, 90)) }

// 8. Captions panel (View → Caption)
try {
  await page.locator('.menu-trigger').nth(2).click()
  await sleep(400)
  await page.locator('.app-menu-item', { hasText: /^Caption$/ }).first().click()
  await sleep(900)
  await shot('captions')
} catch (e) { console.log('captions fail:', String(e).slice(0, 90)) }

// 9. Connect agent (Settings → Agent tab) — token stays masked
try {
  await page.keyboard.press('Meta+,')
  await sleep(1200)
  await page.locator('#settings-tab-agent').click().catch(() => {})
  await page.locator('.connect-snippet').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  await sleep(700)
  await shot('connect-agent')
  await page.keyboard.press('Escape')
  await sleep(600)
} catch (e) { console.log('connect fail:', String(e).slice(0, 90)) }

// 10. Agent mode — begin via MCP, run a few agent ops, shoot the flipped UI
try {
  await mcp.tool('begin_agent_session', { reason: 'assembling the teaser' })
  await sleep(1500)
  await mcp.tool('add_marker', { t_us: us(12), label: 'Outro', color: { r: 102, g: 150, b: 230, a: 255 } })
  await sleep(900)
  await mcp.tool('trim_layer', { layer_id: emberId, edge: 'out', new_t_us: us(16.5) })
  await sleep(1200)
  await shot('agent-mode')
  await invoke('agent_session_end').catch(() => {})
  await sleep(800)
} catch (e) { console.log('agent mode fail:', String(e).slice(0, 90)) }

// 11. Log console filtered-ish (open drawer)
try {
  await page.keyboard.press('Meta+`')
  await sleep(1200)
  await shot('log-console')
  await page.keyboard.press('Meta+`')
} catch (e) { console.log('log console fail:', String(e).slice(0, 90)) }

console.log('shots:', fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png')).join(', '))
await app.close()
console.log('DONE')
