// Compose the final demo video + site trace from a recorded agent run.
//
//   node compose.mjs <runDir> <outDir> [--outro <fromTs>]
//
// Reads <runDir>/frames.jsonl + frames-raw/ + trace.jsonl, cuts idle time
// between tool calls, emits:
//   <outDir>/frames-out/f%05d.jpg   30fps frame sequence (still 1760-wide)
//   <outDir>/agent-session.json     site replay trace (t in output seconds)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const RUN = process.argv[2]
const OUTD = process.argv[3]
if (!RUN || !OUTD) { console.error('usage: node compose.mjs <runDir> <outDir> [--outroFrom <epochMs>] [--outroSec <s>]'); process.exit(1) }
const argv = process.argv.slice(4)
const flag = (k, dflt) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : dflt }
const OUTRO_FROM = flag('--outroFrom', 0)   // epoch ms where playback outro starts in source
const OUTRO_SEC = flag('--outroSec', 0)     // how much of it to keep
const FPS = 30
const PRE = 0.42       // s kept before each move
const POST = 1.05      // s kept after each move
const INTRO = 1.6      // s of pre-session state
const TAIL = 1.6       // s kept after the last move (before outro)

mkdirSync(join(OUTD, 'frames-out'), { recursive: true })

// ---- frames index ----
const frames = readFileSync(join(RUN, 'frames.jsonl'), 'utf8').trim().split('\n')
  .map((l) => JSON.parse(l))                       // { n, ts } ts = epoch seconds
  .sort((a, b) => a.ts - b.ts)
console.log(`frames: ${frames.length}, span ${(frames.at(-1).ts - frames[0].ts).toFixed(1)}s`)

// ---- trace → moves + narration ----
const lines = readFileSync(join(RUN, 'trace.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const calls = new Map() // tool_use_id → move
const moves = []        // {kind:'call', id, name, input, tsCall, tsDone, ms, error}
const says = []         // {kind:'say', text, ts}
let finalText = null
for (const { ts, event } of lines) {
  if (event.type === 'assistant' && event.message?.content) {
    for (const c of event.message.content) {
      if (c.type === 'tool_use') {
        const m = { kind: 'call', id: c.id, name: c.name, input: c.input, tsCall: ts, tsDone: null, ms: null, error: false, result: null }
        calls.set(c.id, m); moves.push(m)
      } else if (c.type === 'text' && c.text?.trim()) {
        says.push({ kind: 'say', text: c.text.trim(), ts })
      }
    }
  } else if (event.type === 'user' && event.message?.content) {
    const content = Array.isArray(event.message.content) ? event.message.content : []
    for (const c of content) {
      if (c.type === 'tool_result' && calls.has(c.tool_use_id)) {
        const m = calls.get(c.tool_use_id)
        m.tsDone = ts
        m.ms = Math.max(1, ts - m.tsCall)
        m.error = c.is_error === true
        const txt = Array.isArray(c.content) ? c.content.filter((x) => x.type === 'text').map((x) => x.text).join('') : (typeof c.content === 'string' ? c.content : '')
        m.result = txt.slice(0, 2000)
      }
    }
  } else if (event.type === 'result') {
    finalText = event.result ?? null
  }
}
const done = moves.filter((m) => m.tsDone !== null)
console.log(`moves: ${done.length} tool calls (${done.filter((m) => m.error).length} errors), ${says.length} say blocks`)

// ---- build kept source windows (epoch s) ----
const t0 = frames[0].ts
const evts = done.map((m) => m.tsDone / 1000)
const win = []
for (const t of evts) win.push([t - PRE, t + POST])
win.sort((a, b) => a[0] - b[0])
const merged = []
for (const w of win) {
  if (merged.length && w[0] <= merged.at(-1)[1] + 0.12) merged.at(-1)[1] = Math.max(merged.at(-1)[1], w[1])
  else merged.push([...w])
}
// intro: INTRO seconds ending right where the first window starts
if (merged.length) {
  const first = merged[0]
  const introStart = Math.max(t0, first[0] - 0.05 - INTRO)
  merged.unshift([introStart, first[0] - 0.001])
}
// tail after last move
merged.at(-1)[1] += TAIL

// outro (played-back cut) appended as its own window
if (OUTRO_FROM > 0 && OUTRO_SEC > 0) merged.push([OUTRO_FROM / 1000, OUTRO_FROM / 1000 + OUTRO_SEC])

// ---- map source time → output time ----
const segs = []
let cursor = 0
for (const [a, b] of merged) {
  if (b <= a) continue
  segs.push({ a, b, out: cursor })
  cursor += b - a
}
const totalOut = cursor
const toOut = (srcT) => {
  for (const s of segs) if (srcT >= s.a - 0.001 && srcT <= s.b + 0.001) return s.out + Math.min(Math.max(srcT - s.a, 0), s.b - s.a)
  return null
}
console.log(`output duration: ${totalOut.toFixed(1)}s over ${segs.length} segments`)

// ---- emit output frames (nearest-at-or-before source frame) ----
let fi = 0
let outN = 0
const findFrame = (srcT) => {
  while (fi + 1 < frames.length && frames[fi + 1].ts <= srcT) fi++
  // fi may need rewind between segments
  if (frames[fi].ts > srcT) { fi = 0; while (fi + 1 < frames.length && frames[fi + 1].ts <= srcT) fi++ }
  return frames[fi]
}
for (const s of segs) {
  fi = 0
  for (let t = s.a; t < s.b; t += 1 / FPS) {
    const fr = findFrame(t)
    copyFileSync(join(RUN, 'frames-raw', String(fr.n).padStart(6, '0') + '.jpg'), join(OUTD, 'frames-out', 'f' + String(outN).padStart(5, '0') + '.jpg'))
    outN++
  }
}
console.log(`emitted ${outN} frames @ ${FPS}fps`)

// ---- site trace ----
const short = (v) => { const s = JSON.stringify(v); return s.length > 220 ? s.slice(0, 217) + '…' : s }
const sanitize = (input) => JSON.parse(JSON.stringify(input ?? {}, (k, v) =>
  typeof v === 'string' ? v.replace(/C:[\\/]Users[\\/]iClass[\\/]Videos[\\/]/gi, '~/Videos/').replace(/\\\\/g, '/') : v))
const entries = []
for (const m of done) {
  const t = toOut(m.tsDone / 1000)
  if (t === null) continue
  entries.push({
    t: Math.round(t * 100) / 100,
    type: 'call',
    name: m.name.replace(/^mcp__weftcut__/, ''),
    args: sanitize(m.input),
    ms: m.ms,
    error: m.error || undefined,
    result_hint: m.error ? short(m.result ?? '') : undefined,
  })
}
for (const s of says) {
  // narration lands right before the move that follows it
  const after = done.find((m) => m.tsCall >= s.ts)
  const t = after ? toOut(after.tsDone / 1000) : toOut(done.at(-1)?.tsDone / 1000)
  if (t === null) continue
  entries.push({ t: Math.max(0, Math.round((t - 0.4) * 100) / 100), type: 'say', text: s.text })
}
entries.sort((a, b) => a.t - b.t)
writeFileSync(join(OUTD, 'agent-session.json'), JSON.stringify({
  fps: FPS,
  duration: Math.round(totalOut * 100) / 100,
  prompt: "Cut “Aurora Ridge” — a 15-second night-sky teaser — from the four clips in ~/Videos: three acts on the A roll, an embers B-roll with an eased fade and a gentle blur, a crossfade and a wipe, a lower third, three captions, a marker and a checkpoint. One of the clips has dead air — find it.",
  final: finalText,
  events: entries,
}, null, 1))
console.log('wrote agent-session.json with', entries.length, 'events')
