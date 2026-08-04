// Prefix every stdin line with an arrival timestamp: {ts, event} JSONL.
import { createInterface } from 'node:readline'
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  const s = line.trim()
  if (!s) return
  let event
  try { event = JSON.parse(s) } catch { event = { raw: s } }
  process.stdout.write(JSON.stringify({ ts: Date.now(), event }) + '\n')
})
