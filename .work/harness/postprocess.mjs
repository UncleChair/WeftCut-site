// Post-process recordings + screenshots into assets/.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import {
  AGENT_LOG,
  ASSETS,
  FFMPEG,
  SHOTS,
  VIDEOS,
  ensureDirectories,
} from './config.mjs'

const run = promisify(execFile)
const ASSET_VIDEOS = path.join(ASSETS, 'video')
const ASSET_SHOTS = path.join(ASSETS, 'shots')
ensureDirectories(ASSET_VIDEOS, ASSET_SHOTS)

const videos = ['agent-session', 'nle-tour']
for (const v of videos) {
  const src = path.join(VIDEOS, `${v}.mp4`)
  if (!fs.existsSync(src)) { console.log('missing', src); continue }
  // 1600w h264 (compatibility) + 1600w vp9 webm (size)
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', src, '-vf', 'scale=1600:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(ASSET_VIDEOS, `${v}.mp4`)])
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', src, '-vf', 'scale=1600:-2', '-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-row-mt', '1', '-an', path.join(ASSET_VIDEOS, `${v}.webm`)])
  console.log('video done', v)
}
// posters
await run(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '31.5', '-i', path.join(VIDEOS, 'agent-session.mp4'), '-frames:v', '1', '-vf', 'scale=1600:-2', '-q:v', '4', path.join(ASSET_VIDEOS, 'agent-session-poster.jpg')]).catch(() => {})
await run(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '12', '-i', path.join(VIDEOS, 'nle-tour.mp4'), '-frames:v', '1', '-vf', 'scale=1600:-2', '-q:v', '4', path.join(ASSET_VIDEOS, 'nle-tour-poster.jpg')]).catch(() => {})

// screenshots → webp (1600w, q85) into assets/shots/
for (const f of fs.readdirSync(SHOTS)) {
  if (!f.endsWith('.png') || f.startsWith('smoke') || f.startsWith('probe') || f.startsWith('debug') || f.startsWith('pre-flight') || f.startsWith('vis-') || f.startsWith('nle-setup')) continue
  const name = f.replace(/\.png$/, '.webp')
  await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', path.join(SHOTS, f), '-vf', 'scale=1600:-2', '-c:v', 'libwebp', '-quality', '85', path.join(ASSET_SHOTS, name)])
}
console.log('shots:', fs.readdirSync(ASSET_SHOTS).join(', '))

// agent log → compact replay format
const log = JSON.parse(fs.readFileSync(AGENT_LOG, 'utf8'))
const compact = log.map((c) => ({
  t: +(c.t / 1000).toFixed(2),
  name: c.name,
  // The public trace should describe the footage, not expose a workstation path.
  args: c.name === 'import_media' && typeof c.args?.path === 'string'
    ? { ...c.args, path: `~/footage/${path.basename(c.args.path)}` }
    : c.args,
  ms: c.ms,
}))
fs.writeFileSync(path.join(ASSETS, 'agent-log.json'), JSON.stringify(compact, null, 1))
console.log('log entries:', compact.length)

for (const f of fs.readdirSync(ASSET_VIDEOS)) {
  const s = fs.statSync(path.join(ASSET_VIDEOS, f))
  console.log(f, (s.size / 1e6).toFixed(2) + 'MB')
}
console.log('DONE')
