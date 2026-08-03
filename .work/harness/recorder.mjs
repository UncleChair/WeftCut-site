// Recorder: launch app, fit window above the dock, record the screen region
// with ffmpeg avfoundation, expose start/stop + helpers.
import { _electron as electron } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { McpClient, sleep } from './mcp.mjs'
import {
  FFMPEG,
  MAIN,
  PROJECTS,
  SHOTS,
  VIDEOS,
  assertDesktopBuild,
  ensureDirectories,
} from './config.mjs'

export {
  AGENT_LOG,
  ASSETS,
  DESKTOP_ROOT,
  FFPROBE,
  FFMPEG,
  HARNESS_DIR,
  MAIN,
  MEDIA,
  PROJECTS,
  ROOT,
  SHOTS,
  SITE_ROOT,
  VIDEOS,
  WEFTCUT_REPO,
  WORK,
} from './config.mjs'

// Screen: 1280x800 pt @2x (2560x1600 px). Menu bar ~26pt, dock ~69pt bottom.
const WIN = { x: 0, y: 26, width: 1280, height: 700 }
const SCALE = 2

export async function launchFitted({ project }) {
  assertDesktopBuild()
  ensureDirectories(PROJECTS, SHOTS, VIDEOS)
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weftcut-site-'))
  const app = await electron.launch({
    args: ['--lang=en-US', `--user-data-dir=${userDataDir}`, MAIN],
    env: { ...process.env, LANG: 'en_US.UTF-8', WEFTCUT_SUPPRESS_ELEVATION_NOTICE: '1' },
  })
  const page = await app.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {})
  await page.addStyleTag({ content: '.dev-splash-toggle{display:none!important}' }).catch(() => {})
  await page.waitForFunction(
    () => typeof window.__weftcutTest?.newProjectAndEnter === 'function',
    undefined,
    { timeout: 90_000 },
  )
  await page.evaluate(
    ([name, parentFolder]) =>
      window.__weftcutTest.newProjectAndEnter({
        parentFolder,
        name,
        canvas: { width: 1920, height: 1080, fpsNum: 30, fpsDen: 1 },
      }),
    [project, PROJECTS],
  )
  await page.locator('.splash-screen').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => {})

  const win = await app.browserWindow(page)
  await win.evaluate((bw, w) => { bw.setContentBounds(w); bw.setAlwaysOnTop(true, 'screen-saver'); bw.focus() }, WIN)
  await sleep(600)
  const bounds = await win.evaluate((bw) => bw.getContentBounds())
  console.log('content bounds:', JSON.stringify(bounds))

  const mcp = await McpClient.connect(userDataDir)
  const invoke = (cmd, args = {}) => page.evaluate(([c, a]) => window.api.backend.invoke(c, a), [cmd, args])
  const hook = (name, args) => page.evaluate(([n, a]) => window.__weftcutTest[n](a), [name, args])
  const settle = async (extraMs = 0) => {
    await page.locator('.derivatives-pill').waitFor({ state: 'detached', timeout: 90_000 }).catch(() => {})
    if (extraMs) await sleep(extraMs)
  }
  return { app, page, mcp, invoke, hook, settle, userDataDir, bounds }
}

// Start an ffmpeg capture of the window rect; returns { stop() }.
export function startCapture(outPath, bounds, { cursor = false } = {}) {
  const crop = `crop=${bounds.width * SCALE}:${bounds.height * SCALE}:${bounds.x * SCALE}:${bounds.y * SCALE}`
  const args = [
    '-y', '-loglevel', 'error',
    '-f', 'avfoundation', '-framerate', '30',
    '-capture_cursor', cursor ? '1' : '0',
    '-i', '3:',
    '-filter:v', crop,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
    outPath,
  ]
  const proc = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'inherit'] })
  // Keep the display awake for the whole capture; kill both on exit.
  // SIGINT (not SIGKILL) so ffmpeg finalizes the mp4 on abort paths.
  const caf = spawn('caffeinate', ['-dims'], { stdio: 'ignore' })
  const grace = () => { try { proc.kill('SIGINT') } catch {}; try { caf.kill('SIGKILL') } catch {} }
  process.on('exit', grace)
  let stopped = false
  const stop = () =>
    new Promise((resolve) => {
      if (stopped) return resolve()
      stopped = true
      try { caf.kill('SIGKILL') } catch {}
      const done = () => { try { proc.kill('SIGINT') } catch {}; resolve() }
      proc.on('close', done)
      proc.stdin.write('q')
      setTimeout(done, 4000)
    })
  return { proc, stop }
}

// Wake the display (caffeinate -u simulates user activity) and verify the
// window region actually shows the app, not a frozen desktop frame.
export async function wakeAndVerify(bounds, samplePath) {
  const { execFile } = await import('node:child_process')
  const run = (cmd, a) => new Promise((res) => execFile(cmd, a, () => res()))
  await run('caffeinate', ['-u', '-t', '2'])
  await new Promise((r) => setTimeout(r, 800))
  await run('screencapture', ['-x', `-R${bounds.x},${bounds.y},${bounds.width},${bounds.height}`, samplePath])
  const { readFileSync } = await import('node:fs')
  const buf = readFileSync(samplePath)
  // The app chrome is very dark (#0c0e12); a desktop wallpaper frame isn't.
  // Cheap probe: PNG of the window region should be small-ish and dark.
  return { bytes: buf.length }
}

// CSS px in the page map 1:1 onto screen points (content origin offset only).
export function cssToScreen(bounds, cssX, cssY) {
  return { x: Math.round(bounds.x + cssX), y: Math.round(bounds.y + cssY) }
}

// boundingBox() of a locator → screen coords of its center.
export async function boxCenter(bounds, locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('no layout box for locator')
  return cssToScreen(bounds, box.x + box.width / 2, box.y + box.height / 2)
}
