# weftcut-site

Marketing homepage for [WeftCut](https://github.com/UncleChair/WeftCut) — the
agent-native desktop video editor. Static, zero-build, zero-dependency: plain
HTML/CSS/JS, no frameworks, no external requests.

## Layout

```
index.html          THE product page — "Cinematic Timeline"
                    (hero = bare video + synced agent-action terminal side by side;
                    Reel 01 agent-native → Reel 02 motifs → Reel 03 the human cut → Reel 04 open source → FAQ)
index.css / index.js  the page's styles and interactions
assets/             shared media: real screen recordings, screenshots, agent log
serve.mjs           zero-dependency node static server (with Range support for video seeks)
package.json        npm start
robots.txt
sitemap.xml
llms.txt            GEO: product summary for LLM crawlers
CONTENT.md          shared fact sheet & content spec used to build the page
.work/              the asset lab (not for deploy): harness scripts, raw recordings, projects
```

## Preview (node, no dependencies)

```sh
cd weftcut-site
npm start            # → http://localhost:8080/
npm start 3000       # custom port
```

## Deploying

1. Canonical + OG URLs already use the production domain `https://weftcut.com`. If it ever changes, replace it (canonical + OG
   URLs in `index.html`, plus `sitemap.xml` and `robots.txt`) with the real
   domain.
2. Ship the directory as-is — the page is already the site root.

## How the media was made (the honest part)

Everything on the page is a real capture of the shipping app, not a mockup:

- `assets/video/agent-session.mp4` — an external agent (a Node script) driving
  WeftCut over its real MCP server (`import_media` → `add_video_layer` →
  `split_layer`/`delete_layer` → `add_transition` → `add_motif` →
  `set_keyframe` → `add_effect` → `apply_subtitles` → `detect_silences` →
  `checkpoint` → playback). The UI was recorded from the macOS screen while
  the tool calls landed live.
- `assets/agent-log.json` — the 31 tool calls of that exact recording, with
  their real wall-clock timestamps plus plain-English `label`s; the page
  replays them synced to the video.
- `assets/video/nle-tour.mp4` — human-style interactions (playback, ruler
  scrub, zoom, blade split, delete, trim, keyframe lanes, effect add,
  Cmd+K → export, log console) driven via CDP input with an in-page cursor.
- `assets/shots/*.webp` — `page.screenshot` stills of the app's panels
  (agent mode, connect-agent snippet, export settings, eyedropper, …).
- `assets/video/motif-showcase.mp4` (+ poster) — a real five-second WeftCut
  export combining Text FX, a lower third, and a countdown. The page plays it
  once when Scene 02 enters view.
- `assets/shots/motif-text-fx.png` — a real transparent Text FX frame used by
  the compact feature card later on the page.
- The demo footage itself is ffmpeg-generated abstract clips (`gradients`
  lavfi source + sine beds) — see `.work/media/`.

The harness that produced all of this lives in `.work/harness/` (Playwright
`_electron` + a minimal MCP client + ffmpeg screen capture). Re-run order:
`agent-demo.mjs` → `nle-tour.mjs` → `screenshots.mjs` → `addendum.mjs` →
`postprocess.mjs`. It requires a WeftCut checkout built with
`npm run build:e2e`. By default the checkout is discovered as a sibling named
`WeftCut`; no workstation-specific paths are required.

### Asset-lab configuration

All harness paths are defined in `.work/harness/config.mjs`. Run it directly to
inspect the resolved configuration without launching Playwright:

```sh
node .work/harness/config.mjs
```

The common overrides are:

| Environment variable | Purpose | Default |
| --- | --- | --- |
| `WEFTCUT_REPO` | WeftCut product checkout | sibling `../WeftCut` |
| `WEFTCUT_DESKTOP_ROOT` | Electron desktop package | `<repo>/apps/desktop` |
| `WEFTCUT_MAIN` | built Electron entry point | `<desktop>/out/main/index.js` |
| `WEFTCUT_WORK_DIR` | generated projects and captures | this repo's `.work` |
| `WEFTCUT_MEDIA_DIR` | source demo media | `<work>/media` |
| `WEFTCUT_PROJECTS_DIR` | temporary WeftCut projects | `<work>/projects` |
| `WEFTCUT_SHOTS_DIR` / `WEFTCUT_VIDEOS_DIR` | raw capture outputs | `<work>/shots`, `<work>/videos` |
| `WEFTCUT_ASSETS_DIR` | processed website assets | this repo's `assets` |
| `WEFTCUT_FFMPEG` / `WEFTCUT_FFPROBE` | media tool command or path | resolved from `PATH` |

`WEFTCUT_SITE_ROOT`, `WEFTCUT_AGENT_LOG`, `WEFTCUT_REVIEW_URL`, and
`WEFTCUT_REVIEW_OUTPUT` are also available for specialized runs. Relative path
overrides are resolved from the site root, so scripts can be launched from any
working directory. For example, in PowerShell:

```powershell
$env:WEFTCUT_REPO = 'C:\src\WeftCut'
$env:WEFTCUT_FFMPEG = 'C:\tools\ffmpeg\bin\ffmpeg.exe'
node .work/harness/screenshots.mjs
```

The ffmpeg screen-capture scripts still use macOS capture facilities; the path
configuration and non-capture helpers themselves are platform-independent.
