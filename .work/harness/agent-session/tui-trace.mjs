// Rebuild the site's replay trace as a *TUI transcript* rather than a call log.
//
//   node tui-trace.mjs runs/run4-trace.jsonl shipped-trace.json ../../../assets/agent-session.json
//
// Two inputs, on purpose:
//
//   runs/run4-trace.jsonl   the raw `claude -p --output-format stream-json` stream from
//                           the recorded session — every tool_use, every tool_result,
//                           every assistant text block. This is the content.
//   shipped-trace.json      the trace compose.mjs emitted for the mp4 that is already
//                           published. The video is time-compressed (idle between calls
//                           is cut), so these timestamps — and only these — keep the
//                           panel in sync with the frames. This is the clock.
//
// The two align 1:1 and in order (43 calls, matched on tool name + latency), so every
// line keeps the timestamp it shipped with and the video never needs re-rendering.
//
// Don't try to recompute the clock instead. compose.mjs's constants as they stand do
// not reproduce the timestamps in shipped-trace.json — a grid search over PRE/POST/
// merge-gap/intro fits at best 15 of 43 — and the shipped args differ from the raw
// input for the resource tools, so that file saw an edit compose.mjs can't replay.
// The mp4 is synced to those numbers, not to compose.mjs's, so they are the truth.
//
// What's new: each call carries what Claude Code's terminal actually prints — the MCP
// display name, the raw one-line params, and the `⎿` result block truncated with a
// "+N lines" tail — plus the session's opening tool-schema load and its closing summary,
// both of which the old log dropped.
import { readFileSync, writeFileSync } from 'node:fs'

const [SRC, CLOCK, OUT] = process.argv.slice(2)
if (!SRC || !CLOCK || !OUT) {
  console.error('usage: node tui-trace.mjs <trace.jsonl> <shipped-trace.json> <out.json>')
  process.exit(1)
}

const RESULT_LINES = 3   // result lines kept before the "+N lines" tail
const RESULT_COLS = 96   // per-line clip width

// ---------- raw session ----------
const stream = readFileSync(SRC, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const pending = new Map()
const moves = []
const narration = []
let finalText = null
const meta = {}
for (const { ts, event } of stream) {
  if (event.type === 'system' && event.subtype === 'init') {
    meta.model = event.model
    meta.server = event.mcp_servers?.[0]?.name ?? 'weftcut'
  } else if (event.type === 'assistant' && event.message?.content) {
    for (const c of event.message.content) {
      if (c.type === 'tool_use') {
        const m = { name: c.name, input: c.input, tsCall: ts, tsDone: null, ms: null, error: false, result: '' }
        pending.set(c.id, m); moves.push(m)
      } else if (c.type === 'text' && c.text?.trim()) {
        narration.push({ text: c.text.trim(), ts })
      }
    }
  } else if (event.type === 'user' && event.message?.content) {
    for (const c of (Array.isArray(event.message.content) ? event.message.content : [])) {
      if (c.type === 'tool_result' && pending.has(c.tool_use_id)) {
        const m = pending.get(c.tool_use_id)
        m.tsDone = ts
        m.ms = Math.max(1, ts - m.tsCall)
        m.error = c.is_error === true
        m.result = (Array.isArray(c.content)
          ? c.content.filter((x) => x.type === 'text').map((x) => x.text).join('')
          : (typeof c.content === 'string' ? c.content : '')).slice(0, 40000)
      }
    }
  } else if (event.type === 'result') {
    finalText = event.result ?? null
    meta.turns = event.num_turns
    meta.wall_ms = event.duration_ms
  }
}
const done = moves.filter((m) => m.tsDone !== null)
// The closing summary arrives as the run's `result`, not as another text block.
if (narration.at(-1)?.text === (finalText ?? '').trim()) narration.pop()

// ---------- clock ----------
const clock = JSON.parse(readFileSync(CLOCK, 'utf8'))
const clockCalls = clock.events.filter((e) => e.type === 'call')
const clockSays = clock.events.filter((e) => e.type === 'say')

// ---------- TUI rendering ----------
const sanitize = (v) => typeof v === 'string'
  ? v.replace(/C:[\\/]Users[\\/]iClass[\\/]Videos[\\/]/gi, '~/Videos/')
     .replace(/C:[\\/]Users[\\/]iClass[\\/]/gi, '~/')
     .replace(/\\\\/g, '/')
  : v

// Claude Code prints MCP tools as "server - tool (MCP)" and built-ins by label.
const LABEL = {
  ToolSearch: 'Search tools',
  ReadMcpResourceTool: 'Read MCP resource',
  ListMcpResourcesTool: 'List MCP resources',
}
const displayName = (n) => n.startsWith('mcp__')
  ? `${n.split('__')[1]} - ${n.split('__').slice(2).join('__')} (MCP)`
  : (LABEL[n] ?? n)
const shortName = (n) => n.replace(/^mcp__[^_]+__/, '')

// Params as the terminal prints them: `key: value`, strings JSON-quoted.
function paramStr(name, input) {
  if (name === 'ReadMcpResourceTool') return `${input.server}, ${input.uri}`
  if (name === 'ListMcpResourcesTool') return String(input.server)
  if (name === 'ToolSearch') return JSON.stringify(input.query)
  return Object.entries(input ?? {})
    .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : JSON.stringify(v)}`)
    .join(', ')
}

const clip = (s, n = RESULT_COLS) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// The `⎿` block. MCP resource reads come back wrapped in a JSON envelope; the terminal
// shows the resource body, so unwrap it before counting lines.
function resultBlock(m) {
  const raw = (m.result ?? '').trim()
  if (m.error) return { out: ['Error: ' + clip(sanitize(raw).replace(/\s+/g, ' '), 120)], more: 0 }
  // ToolSearch echoes its schemas back into the context, not into the stream — the
  // recorded result is empty, so there is nothing honest to print under it.
  if (!raw && m.name === 'ToolSearch') return { out: [], more: 0 }
  if (!raw || /completed with no output\)$/.test(raw)) return { out: ['(No content)'], more: 0 }
  let body = raw
  try {
    const j = JSON.parse(raw)
    if (j?.contents?.[0]?.text) body = j.contents[0].text
  } catch { /* not a resource envelope */ }
  const all = sanitize(body).split('\n')
  while (all.length && !all.at(-1).trim()) all.pop()
  const out = all.slice(0, RESULT_LINES).map((l) => clip(l.replace(/\t/g, '  ')))
  return { out, more: Math.max(0, all.length - out.length) }
}

const toEvent = (m, t, aux) => {
  const { out, more } = resultBlock(m)
  return {
    t, kind: 'call',
    name: shortName(m.name),
    display: displayName(m.name),
    params: sanitize(paramStr(m.name, m.input)),
    ms: m.ms, out, more,
    error: m.error || undefined,
    aux: aux || undefined,
  }
}

// ---------- align content to the clock ----------
const events = []
const edits = done.filter((m) => m.name !== 'ToolSearch')   // ToolSearch ran during cut footage
if (edits.length !== clockCalls.length) throw new Error(`call count drift: ${edits.length} vs ${clockCalls.length}`)
edits.forEach((m, i) => {
  const c = clockCalls[i]
  if (shortName(m.name) !== c.name || m.ms !== c.ms) throw new Error(`misalignment at ${i}: ${m.name} vs ${c.name}`)
  events.push(toEvent(m, c.t, !m.name.startsWith('mcp__')))
})

// Narration: the clock kept every text block except the opening line, whose own tool
// calls were cut. Take the tail so the pairing can't drift.
const paired = narration.slice(narration.length - clockSays.length)
paired.forEach((s, i) => {
  if (s.text !== clockSays[i].text) throw new Error(`say drift at ${i}`)
  events.push({ t: clockSays[i].t, kind: 'say', text: sanitize(s.text) })
})

// Pre-roll — the tool-schema load that opened the session. It is real and in order but
// its source time sits in cut footage, so it is spread across the intro (the seconds of
// untouched editor before the first move lands).
const firstT = clockCalls[0].t
const preroll = done.filter((m) => m.name === 'ToolSearch' && m.tsCall < edits[0].tsCall)
narration.slice(0, narration.length - clockSays.length).forEach((s) => {
  events.push({ t: 0, kind: 'say', text: sanitize(s.text) })
})
preroll.forEach((m, i) => events.push(toEvent(m, Math.round((0.2 + (i * (firstT - 0.55)) / preroll.length) * 100) / 100, true)))

// Closing summary, revealed paragraph by paragraph over the playback outro.
const lastT = clockCalls.at(-1).t
if (finalText) {
  const paras = finalText.trim().split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const room = Math.max(0, clock.duration - 2.5 - (lastT + 1.4))
  paras.forEach((text, i) => {
    events.push({ t: Math.round((lastT + 1.4 + (room * i) / Math.max(1, paras.length)) * 100) / 100, kind: 'final', text: sanitize(text) })
  })
}

const ORDER = { say: 0, call: 1, final: 2 }
events.sort((a, b) => a.t - b.t || ORDER[a.kind] - ORDER[b.kind])

const payload = {
  fps: clock.fps,
  duration: clock.duration,
  session: {
    model: meta.model,
    server: meta.server,
    turns: meta.turns,
    wall_ms: meta.wall_ms,
    calls: events.filter((e) => e.kind === 'call' && !e.aux).length,
    errors: events.filter((e) => e.error).length,
  },
  prompt: clock.prompt,
  final: finalText,
  events,
}
writeFileSync(OUT, JSON.stringify(payload, null, 1))

console.log(`aligned ${edits.length} calls + ${paired.length} say blocks to the shipped clock ✓`)
console.log(`events ${events.length}: ${payload.session.calls} edits, ${events.filter((e) => e.aux).length} aux, ` +
  `${events.filter((e) => e.kind === 'say').length} say, ${events.filter((e) => e.kind === 'final').length} final, ` +
  `${payload.session.errors} errors`)
console.log(`span 0 → ${events.at(-1).t}s of ${clock.duration}s`)
