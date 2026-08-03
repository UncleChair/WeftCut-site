// Debug what the page looks like when recordVideo is enabled.
import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sleep } from './mcp.mjs'
import {
  MAIN,
  SHOTS,
  VIDEOS,
  assertDesktopBuild,
  ensureDirectories,
} from './config.mjs'

assertDesktopBuild()
ensureDirectories(VIDEOS, SHOTS)

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weftcut-site-'))
const app = await electron.launch({
  args: ['--lang=en-US', `--user-data-dir=${userDataDir}`, MAIN],
  env: { ...process.env, LANG: 'en_US.UTF-8', WEFTCUT_SUPPRESS_ELEVATION_NOTICE: '1' },
  recordVideo: { dir: VIDEOS },
})
const page = await app.firstWindow({ timeout: 60_000 })
console.log('url:', page.url())
for (let i = 0; i < 6; i++) {
  await sleep(3000)
  const state = await page
    .evaluate(() => ({
      ready: document.readyState,
      hasHook: typeof window.__weftcutTest,
      splash: !!document.querySelector('.splash-screen'),
      body: document.body?.className?.slice(0, 80),
    }))
    .catch((e) => String(e).slice(0, 120))
  console.log(i, JSON.stringify(state))
}
await page.screenshot({ path: path.join(SHOTS, 'debug-recordvideo.png') }).catch((e) => console.log('shot fail', String(e).slice(0, 100)))
await page.close()
await app.close()
console.log('videos:', fs.readdirSync(VIDEOS))
