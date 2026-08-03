// Shared configuration for every asset-lab script.
//
// Paths default to this repository and a sibling `WeftCut` checkout. Override
// any machine-specific location with the environment variables documented in
// README.md. Relative overrides are resolved from SITE_ROOT (except
// WEFTCUT_SITE_ROOT itself, which is resolved from the current directory).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SITE_ROOT = path.resolve(HARNESS_DIR, '..', '..')

const setting = (name, fallback) => process.env[name]?.trim() || fallback
const configuredPath = (name, fallback, base) => {
  const value = process.env[name]?.trim()
  return value ? path.resolve(base, value) : fallback
}

export const SITE_ROOT = configuredPath(
  'WEFTCUT_SITE_ROOT',
  DEFAULT_SITE_ROOT,
  process.cwd(),
)
export const WORK = configuredPath(
  'WEFTCUT_WORK_DIR',
  path.join(SITE_ROOT, '.work'),
  SITE_ROOT,
)
export const MEDIA = configuredPath(
  'WEFTCUT_MEDIA_DIR',
  path.join(WORK, 'media'),
  SITE_ROOT,
)
export const PROJECTS = configuredPath(
  'WEFTCUT_PROJECTS_DIR',
  path.join(WORK, 'projects'),
  SITE_ROOT,
)
export const SHOTS = configuredPath(
  'WEFTCUT_SHOTS_DIR',
  path.join(WORK, 'shots'),
  SITE_ROOT,
)
export const VIDEOS = configuredPath(
  'WEFTCUT_VIDEOS_DIR',
  path.join(WORK, 'videos'),
  SITE_ROOT,
)
export const ASSETS = configuredPath(
  'WEFTCUT_ASSETS_DIR',
  path.join(SITE_ROOT, 'assets'),
  SITE_ROOT,
)
export const AGENT_LOG = configuredPath(
  'WEFTCUT_AGENT_LOG',
  path.join(WORK, 'agent-log.json'),
  SITE_ROOT,
)

export const WEFTCUT_REPO = configuredPath(
  'WEFTCUT_REPO',
  path.resolve(SITE_ROOT, '..', 'WeftCut'),
  SITE_ROOT,
)
export const DESKTOP_ROOT = configuredPath(
  'WEFTCUT_DESKTOP_ROOT',
  path.join(WEFTCUT_REPO, 'apps', 'desktop'),
  SITE_ROOT,
)
// Backward-compatible name used by older harness imports.
export const ROOT = DESKTOP_ROOT
export const MAIN = configuredPath(
  'WEFTCUT_MAIN',
  path.join(DESKTOP_ROOT, 'out', 'main', 'index.js'),
  SITE_ROOT,
)

// Command names intentionally fall back to PATH rather than a package-manager
// installation directory.
export const FFMPEG = setting('WEFTCUT_FFMPEG', 'ffmpeg')
export const FFPROBE = setting('WEFTCUT_FFPROBE', 'ffprobe')
export const REVIEW_URL = setting('WEFTCUT_REVIEW_URL', 'http://localhost:8092/')
export const REVIEW_OUTPUT = configuredPath(
  'WEFTCUT_REVIEW_OUTPUT',
  path.join(WORK, 'review'),
  SITE_ROOT,
)

export function ensureDirectories(...directories) {
  for (const directory of directories) fs.mkdirSync(directory, { recursive: true })
}

export function assertDesktopBuild() {
  if (fs.existsSync(MAIN)) return
  throw new Error(
    `WeftCut Electron entry point not found: ${MAIN}\n` +
      'Build the product first, or set WEFTCUT_REPO, WEFTCUT_DESKTOP_ROOT, or WEFTCUT_MAIN.',
  )
}

export const harnessConfig = Object.freeze({
  SITE_ROOT,
  WORK,
  MEDIA,
  PROJECTS,
  SHOTS,
  VIDEOS,
  ASSETS,
  AGENT_LOG,
  WEFTCUT_REPO,
  DESKTOP_ROOT,
  MAIN,
  FFMPEG,
  FFPROBE,
  REVIEW_URL,
  REVIEW_OUTPUT,
})

// `node .work/harness/config.mjs` is a quick, dependency-free configuration
// check and is also useful in CI diagnostics.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(harnessConfig, null, 2))
}
