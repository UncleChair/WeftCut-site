// Verify Playwright recordVideo works on the Electron app + playback is smooth.
import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { McpClient, us, sleep } from './mcp.mjs'
import {
  MAIN,
  MEDIA,
  PROJECTS,
  VIDEOS,
  assertDesktopBuild,
  ensureDirectories,
} from './config.mjs'

assertDesktopBuild()
ensureDirectories(PROJECTS, VIDEOS)

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weftcut-site-'))
const app = await electron.launch({
  args: ['--lang=en-US', `--user-data-dir=${userDataDir}`, MAIN],
  env: { ...process.env, LANG: 'en_US.UTF-8', WEFTCUT_SUPPRESS_ELEVATION_NOTICE: '1' },
  recordVideo: { dir: VIDEOS },
})
const page = await app.firstWindow({ timeout: 60_000 })
await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {})
console.log('viewport:', page.viewportSize())
await page.locator('.splash-screen').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => {})

await page.waitForFunction(() => typeof window.__weftcutTest?.newProjectAndEnter === 'function', undefined, { timeout: 60_000 })
fs.rmSync(path.join(PROJECTS, 'RecTest'), { recursive: true, force: true })
await page.evaluate((parentFolder) =>
  window.__weftcutTest.newProjectAndEnter({
    parentFolder,
    name: 'RecTest',
    canvas: { width: 1920, height: 1080, fpsNum: 30, fpsDen: 1 },
  }),
  PROJECTS,
)
await sleep(1000)

const mcp = await McpClient.connect(userDataDir)
const dawn = await mcp.toolId('import_media', { path: path.join(MEDIA, 'dawn.mp4') })
const tide = await mcp.toolId('import_media', { path: path.join(MEDIA, 'tide.mp4') })
const trackId = await mcp.toolId('add_track', { label: 'V1' })
await mcp.tool('add_video_layer', { track_id: trackId, media_id: dawn, t_start_us: 0, t_end_us: us(6), src_in_us: 0, src_out_us: us(6) })
await mcp.tool('add_video_layer', { track_id: trackId, media_id: tide, t_start_us: us(6), t_end_us: us(12), src_in_us: 0, src_out_us: us(6) })

// Wait for derivatives to settle.
await page.locator('.derivatives-pill').waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {})
await sleep(1000)

// Play 10s, confirm the playhead advances.
await page.evaluate(() => window.__weftcutTest.transportSeekUs(0))
await page.evaluate(() => window.__weftcutTest.transportPlay())
await sleep(2000)
const probe = await page.evaluate(() => window.__weftcutTest.previewResourceProbe())
console.log('probe @2s:', JSON.stringify({ playing: probe.playing, positionUs: probe.positionUs }))
await sleep(8000)
const probe2 = await page.evaluate(() => window.__weftcutTest.previewResourceProbe())
console.log('probe @10s:', JSON.stringify({ playing: probe2.playing, positionUs: probe2.positionUs }))
await page.evaluate(() => window.__weftcutTest.transportPause())

await page.close()
await app.close()
await sleep(500)
console.log('videos:', fs.readdirSync(VIDEOS))
console.log('DONE')
