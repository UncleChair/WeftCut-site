// NLE TOUR — human-driven interactions. Playwright input + in-page fake
// cursor overlay (reliable hits AND a visible cursor in the capture).
// Run: node nle-tour.mjs [--norecord]
import fs from 'node:fs'
import path from 'node:path'
import {
  MEDIA,
  PROJECTS,
  SHOTS,
  VIDEOS,
  launchFitted,
  startCapture,
} from './recorder.mjs'
import { us, sleep } from './mcp.mjs'

const RECORD = !process.argv.includes('--norecord')

fs.rmSync(path.join(PROJECTS, 'NLETour'), { recursive: true, force: true })
const { app, page, mcp, hook, settle, bounds } = await launchFitted({ project: 'NLETour' })

// ── Silent setup ───────────────────────────────────────────────────────────
const ids = {}
for (const n of ['dawn', 'tide', 'ember']) ids[n] = await mcp.toolId('import_media', { path: path.join(MEDIA, `${n}.mp4`) })
const tracksRes = await mcp.readResource('project://tracks')
const trackList = tracksRes?.tracks ?? tracksRes
const aRoll = trackList.find((t) => /a.?roll/i.test(t.label ?? t.name ?? '')) ?? trackList.at(-1)
const put = (name, tr, t0, t1, srcIn = 0) =>
  mcp.tool('add_video_layer', { track_id: tr, media_id: ids[name], t_start_us: us(t0), t_end_us: us(t1), src_in_us: us(srcIn), src_out_us: us(srcIn + (t1 - t0)) })
await put('dawn', aRoll.id, 0, 6)
const tideR = await put('tide', aRoll.id, 6, 12)
await put('ember', aRoll.id, 12, 17, 2)
const tideId = typeof tideR === 'string' ? tideR : tideR.video_layer_id ?? tideR.layer_id
let motifId = 'lower-third'
try {
  const motifs = await mcp.tool('list_motifs')
  const lt = (motifs ?? []).find((m) => /lower/i.test(m.id + (m.name ?? '')))
  if (lt) motifId = lt.id
} catch {}
await mcp.tool('add_motif', { motif_id: motifId, t_start_us: us(1), t_end_us: us(5), props: { title: 'The Coast at Dawn', subtitle: 'WeftCut', accent: '#6696E6' } })
const mk = (t, v, interp) => mcp.tool('set_keyframe', { layer_id: tideId, param_key: 'opacity', t_us: us(t), value: v, ...(interp ? { interp } : {}) })
if (tideId) {
  await mk(6, 0); await mk(7, 1, { kind: 'EaseOut' }); await mk(11, 1); await mk(12, 0, { kind: 'EaseIn' })
}
await mcp.tool('apply_subtitles', { body: '1\n00:00:01,000 --> 00:00:03,500\nA real timeline, frame-accurate\n\n2\n00:00:06,000 --> 00:00:09,000\nKeyframes, effects, captions, audio\n' })
await settle()
await hook('transportSeekUs', us(0))

// bring the A-roll row fully above the status bar
await page.evaluate(() => {
  const el = document.querySelector('.weft-dock-panel[data-panel-kind="timeline"] .overflow-auto')
  if (el) el.scrollTop = 120
})
await sleep(500)

// inject the fake cursor (in-page, pointer-events:none; follows CDP input)
await page.evaluate(() => {
  if (document.getElementById('demo-cursor')) return
  const c = document.createElement('div')
  c.id = 'demo-cursor'
  c.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M5.5 3.2 18.8 10.6l-6.9 1.2-3.4 6z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>'
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));transform:translate(-100px,-100px)'
  document.documentElement.appendChild(c)
  window.addEventListener('pointermove', (e) => {
    c.style.transform = `translate(${e.clientX - 4}px, ${e.clientY - 3}px)`
  }, { capture: true, passive: true })
})
await sleep(400)
console.log('setup complete')

// ── pointer helpers (CSS px) ───────────────────────────────────────────────
const pos = async (loc, fx = 0.5, fy = 0.5) => {
  const b = await loc.boundingBox().catch(() => null)
  return b ? { x: b.x + b.width * fx, y: b.y + b.height * fy } : null
}
const moveTo = (x, y, steps = 26) => page.mouse.move(x, y, { steps })
const click = async (x, y) => { await moveTo(x, y); await sleep(130); await page.mouse.down(); await sleep(75); await page.mouse.up() }
const clickLoc = async (loc, fx, fy) => { const p = await pos(loc, fx, fy); if (p) await click(p.x, p.y); return p }
const drag = async (x1, y1, x2, y2, steps = 34) => {
  await moveTo(x1, y1, 20); await sleep(160)
  await page.mouse.down(); await sleep(220)
  await moveTo(x2, y2, steps); await sleep(130)
  await page.mouse.up()
}

// ── Recording ──────────────────────────────────────────────────────────────
const out = path.join(VIDEOS, 'nle-tour.mp4')
fs.mkdirSync(VIDEOS, { recursive: true })
const cap = RECORD ? startCapture(out, bounds, { cursor: false }) : null
if (RECORD) await sleep(1800)
const mark = (s) => console.log(`[${new Date().toISOString().slice(17, 23)}] ${s}`)
const beat = (ms) => sleep(ms)

// Beat 1: establish (2s)
await beat(2000); mark('establish')

// Beat 2: playback via the transport button
await clickLoc(page.locator('[aria-label="Play / pause"]').first())
await beat(3500)
await clickLoc(page.locator('[aria-label="Play / pause"]').first())
mark('play/pause')
await beat(800)

// Beat 3: scrub on the ruler
const rb = await page.locator('[data-testid="timeline-ruler"]').boundingBox().catch(() => null)
if (rb) await drag(rb.x + rb.width * 0.15, rb.y + rb.height / 2, rb.x + rb.width * 0.6, rb.y + rb.height / 2, 38)
mark('scrub')
await beat(900)

// Beat 4: ctrl+wheel zoom over the timeline, then Home
const tb = await page.locator('.weft-dock-panel[data-panel-kind="timeline"]').boundingBox().catch(() => null)
if (tb) {
  await moveTo(tb.x + tb.width * 0.5, tb.y + tb.height * 0.6, 14)
  await sleep(200)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -200)
  await beat(420)
  await page.mouse.wheel(0, -200)
  await page.keyboard.up('Control')
}
mark('zoom in')
await beat(600)
await page.keyboard.press('Home')
await beat(700)

// Beat 5: select the tide clip (A/B mode rows: dawn, tide, ember on A roll)
const clips = page.locator('.timeline-layer[title^="VideoClip:"]')
console.log('clips:', await clips.count())
await clickLoc(clips.nth(1))
mark('select tide')
await beat(1000)

// Beat 6: blade split tide at ~45%, exit blade
await page.keyboard.press('c')
await beat(600)
await clickLoc(clips.nth(1), 0.45)
await beat(700)
await page.keyboard.press('Escape')
mark('blade split')
await beat(900)
console.log('clips after split:', await page.locator('.timeline-layer[title^="VideoClip:"]').count())

// Beat 7: delete the right half (dawn, tideL, tideR, ember → nth(2))
await clickLoc(page.locator('.timeline-layer[title^="VideoClip:"]').nth(2))
await beat(400)
await page.keyboard.press('Delete')
mark('delete segment')
await beat(1000)

// Beat 8: trim the surviving tide segment's OUT edge rightward (visible on screen)
const tl2 = page.locator('.timeline-layer[title^="VideoClip:"]')
const tideL = await tl2.nth(1).boundingBox().catch(() => null)
if (tideL) await drag(tideL.x + tideL.width - 2, tideL.y + tideL.height / 2, tideL.x + tideL.width + 150, tideL.y + tideL.height / 2, 32)
mark('trim tide out')
await beat(1000)

// Beat 9: keyframe lanes — expand A-roll lanes (last twirl), focus a key
const twirls = page.locator('[data-testid="kf-lane-twirl"]:not([disabled])')
const tw = await twirls.count()
console.log('kf twirls:', tw)
if (tw > 0) {
  await clickLoc(twirls.nth(tw - 1))
  await beat(800)
  // the sub-lane expands below the row — scroll it into view
  await page.evaluate(() => {
    const el = document.querySelector('.weft-dock-panel[data-panel-kind="timeline"] .overflow-auto')
    if (el) el.scrollTop += 140
  })
  await beat(500)
}
const dia = page.locator('.kf-diamond.kf-sublane-diamond').nth(1)
if (await dia.count()) await clickLoc(dia)
mark('keyframe lanes')
await beat(1200)

// Beat 10: zoom back out so ember is on screen, then select it → Effect tab → blur
if (tb) {
  await moveTo(tb.x + tb.width * 0.5, tb.y + tb.height * 0.6, 10)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 200)
  await beat(350)
  await page.mouse.wheel(0, 200)
  await page.keyboard.up('Control')
  await beat(600)
}
await clickLoc(page.locator('.timeline-layer[title^="VideoClip:"]').nth(2), 0.08)
await beat(600)
await clickLoc(page.locator('.weft-dock-tab-label', { hasText: 'Effect' }).first())
await beat(700)
await clickLoc(page.locator('[data-testid="effect-add"]'))
await beat(900)
const strength = page.locator('[data-testid^="effect-param-"][data-testid$="-strength"]').first()
if (await strength.count()) {
  await clickLoc(strength)
  await beat(200)
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('10', { delay: 60 })
  await page.keyboard.press('Tab')
}
await page.screenshot({ path: path.join(SHOTS, 'tour-debug-effect.png') })
mark('effect blur 10')
await beat(1100)

// Beat 11: Cmd+K palette → export dialog
await page.keyboard.press('Meta+k')
await beat(900)
await page.keyboard.type('export', { delay: 90 })
await beat(1100)
await page.keyboard.press('Enter')
await beat(1800)
await page.screenshot({ path: path.join(SHOTS, 'tour-debug-export.png') })
mark('palette → export')
await beat(1800)
await clickLoc(page.locator('button', { hasText: /^Cancel$/ }).first())
await beat(900)

// Beat 12: log console
await page.keyboard.press('Meta+`')
await beat(1600)
mark('log console')
await page.keyboard.press('Meta+`')
await beat(600)

// Beat 13: finale — from the top, play
await page.keyboard.press('Home')
await beat(700)
await clickLoc(page.locator('[aria-label="Play / pause"]').first())
await beat(5000)
await clickLoc(page.locator('[aria-label="Play / pause"]').first())
mark('finale')
await beat(1200)

if (cap) await cap.stop()
await app.close()
console.log('DONE')
