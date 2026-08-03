// Smoke test: launch built WeftCut with isolated userData, create a project,
// drive it over MCP, take a screenshot.
import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { McpClient, us, sleep } from './mcp.mjs'
import {
  MAIN,
  MEDIA,
  PROJECTS,
  SHOTS,
  assertDesktopBuild,
  ensureDirectories,
} from './config.mjs'

assertDesktopBuild()
ensureDirectories(PROJECTS, SHOTS)

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weftcut-site-'))
console.log('userData:', userDataDir)

const app = await electron.launch({
  args: ['--lang=en-US', `--user-data-dir=${userDataDir}`, MAIN],
  env: {
    ...process.env,
    LANG: 'en_US.UTF-8',
    WEFTCUT_SUPPRESS_ELEVATION_NOTICE: '1',
  },
})
const page = await app.firstWindow({ timeout: 60_000 })
await page.waitForLoadState('domcontentloaded')

// Size the window for recording.
const win = await app.browserWindow(page)
await win.evaluate((bw) => bw.setSize(1600, 1000))

await page.waitForFunction(
  () => typeof window.__weftcutTest?.newProjectAndEnter === 'function',
  undefined,
  { timeout: 60_000 },
)
console.log('hooks ok')

fs.rmSync(path.join(PROJECTS, 'Smoke'), { recursive: true, force: true })
await page.evaluate((parentFolder) =>
  window.__weftcutTest.newProjectAndEnter({
    parentFolder,
    name: 'Smoke',
    canvas: { width: 1920, height: 1080, fpsNum: 30, fpsDen: 1 },
  }),
  PROJECTS,
)
console.log('project created')
await sleep(1500)
await page.screenshot({ path: path.join(SHOTS, 'smoke-01-empty.png') })

// MCP drive: import + place a clip.
const mcp = await McpClient.connect(userDataDir)
console.log('mcp connected')
const tools = await mcp.request('tools/list')
console.log('tool count:', tools.tools.length)

const mediaId = await mcp.toolId('import_media', { path: path.join(MEDIA, 'dawn.mp4') })
console.log('imported:', mediaId)

const trackId = await mcp.toolId('add_track', { label: 'V1' })
console.log('track:', trackId)

const layer = await mcp.tool('add_video_layer', {
  track_id: trackId,
  media_id: mediaId,
  t_start_us: 0,
  t_end_us: us(8),
  src_in_us: 0,
  src_out_us: us(8),
})
console.log('layer:', JSON.stringify(layer).slice(0, 200))
await sleep(2500)
await page.screenshot({ path: path.join(SHOTS, 'smoke-02-clip.png') })

console.log('calls:', JSON.stringify(mcp.calls, null, 2))
await app.close()
console.log('DONE')
