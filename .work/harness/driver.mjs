// Shared demo driver: launch app, create project, hand back helpers.
import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { McpClient, sleep } from './mcp.mjs'
import {
  MAIN,
  PROJECTS,
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

export async function launchDemo({ project, record = false, videoDir } = {}) {
  assertDesktopBuild()
  ensureDirectories(PROJECTS)
  if (record && videoDir) ensureDirectories(videoDir)
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weftcut-site-'))
  const app = await electron.launch({
    args: ['--lang=en-US', `--user-data-dir=${userDataDir}`, MAIN],
    env: { ...process.env, LANG: 'en_US.UTF-8', WEFTCUT_SUPPRESS_ELEVATION_NOTICE: '1' },
    ...(record ? { recordVideo: { dir: videoDir } } : {}),
  })
  const page = await app.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {})

  await page.waitForFunction(
    () => typeof window.__weftcutTest?.newProjectAndEnter === 'function',
    undefined,
    { timeout: 90_000 },
  )
  fs.rmSync(path.join(PROJECTS, project), { recursive: true, force: true })
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
  await sleep(800)

  const mcp = await McpClient.connect(userDataDir)

  const invoke = (cmd, args = {}) =>
    page.evaluate(([c, a]) => window.api.backend.invoke(c, a), [cmd, args])
  const hook = (name, args) =>
    page.evaluate(([n, a]) => window.__weftcutTest[n](a), [name, args])

  // Wait until media derivatives (thumbnails/proxies) are done.
  const settle = async (extraMs = 0) => {
    await page.locator('.derivatives-pill').waitFor({ state: 'detached', timeout: 90_000 }).catch(() => {})
    if (extraMs) await sleep(extraMs)
  }

  return { app, page, mcp, invoke, hook, settle, userDataDir }
}
