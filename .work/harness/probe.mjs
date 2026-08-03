// Probe: fitted window + ffmpeg crop + real cursor capture.
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  FFMPEG,
  FFPROBE,
  HARNESS_DIR,
  PROJECTS,
  SHOTS,
  VIDEOS,
  launchFitted,
  startCapture,
} from './recorder.mjs'
import { sleep } from './mcp.mjs'

const run = promisify(execFile)
fs.rmSync(path.join(PROJECTS, 'Probe'), { recursive: true, force: true })

const { app, page, bounds } = await launchFitted({ project: 'Probe' })
await sleep(1000)

const out = path.join(VIDEOS, 'probe.mp4')
fs.mkdirSync(path.dirname(out), { recursive: true })
const cap = startCapture(out, bounds, { cursor: true })
await sleep(1500) // capture warmup

// Move the real cursor in an L shape so we can verify cursor + crop.
const swift = (a) => run('swift', [path.join(HARNESS_DIR, 'mouse.swift'), ...a.map(String)])
await swift(['move', 200, 200, 20])
await swift(['move', 1000, 200, 30])
await swift(['move', 1000, 600, 30])
await swift(['move', 200, 600, 30])
await cap.stop()
console.log('capture stopped')
await app.close()

const { stdout } = await run(FFPROBE, ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height,nb_frames', '-of', 'csv=p=0', out])
console.log('video:', stdout.trim())
fs.mkdirSync(SHOTS, { recursive: true })
await run(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '4', '-i', out, '-frames:v', '1', path.join(SHOTS, 'probe-frame.png')])
console.log('DONE')
