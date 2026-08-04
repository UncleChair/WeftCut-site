// Long-running CDP screencast recorder for the WeftCut dev app.
// Writes every frame to <outdir>/frames-raw/NNNNNN.jpg plus a frames.jsonl
// index of { n, ts } (ts = CDP TimeSinceEpoch seconds). Stops when
// <outdir>/stop exists or after MAX_MS.
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2]
if (!OUT) { console.error('usage: node recorder.mjs <outdir>'); process.exit(1) }
const RAW = join(OUT, 'frames-raw')
mkdirSync(RAW, { recursive: true })
const MAX_MS = 20 * 60 * 1000

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = list.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:1420'))
if (!page) { console.error('no page target'); process.exit(1) }
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let seq = 0
const pending = new Map()
let n = 0
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return }
  if (msg.method === 'Page.screencastFrame') {
    const idx = n++
    writeFileSync(join(RAW, String(idx).padStart(6, '0') + '.jpg'), Buffer.from(msg.params.data, 'base64'))
    appendFileSync(join(OUT, 'frames.jsonl'), JSON.stringify({ n: idx, ts: msg.params.metadata.timestamp }) + '\n')
    ws.send(JSON.stringify({ id: ++seq, method: 'Page.screencastFrameAck', params: { sessionId: msg.params.sessionId } }))
  }
}
function send(method, params = {}) {
  const id = ++seq
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((res) => pending.set(id, res))
}

await send('Page.enable')
await send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1760, maxHeight: 937, everyNthFrame: 1 })
writeFileSync(join(OUT, 'recorder-started'), String(Date.now()))
console.log('recording started', new Date().toISOString())

const t0 = Date.now()
const timer = setInterval(async () => {
  if (existsSync(join(OUT, 'stop')) || Date.now() - t0 > MAX_MS) {
    clearInterval(timer)
    await send('Page.stopScreencast')
    writeFileSync(join(OUT, 'recorder-done'), JSON.stringify({ frames: n, stoppedAt: Date.now() }))
    console.log('recording stopped —', n, 'frames')
    ws.close()
    process.exit(0)
  }
}, 400)
