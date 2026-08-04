# weftcut-site

Marketing homepage for [WeftCut](https://github.com/UncleChair/WeftCut) — the
agent-native desktop video editor. Static, zero-build, zero-dependency: plain
HTML/CSS/JS, no frameworks, no external requests.

## Layout

```
index.html          THE product page — "Cinematic Timeline"
                    (hero = bare video + synced agent-action terminal side by side;
                    Reel 01 agent-native → Reel 02 motifs → Reel 03 the human cut → Epilogue product finale → Post-credits FAQ)
index.css / index.js  the page's styles and interactions
build-i18n.mjs      generates the localized pages from index.html + i18n/*.json
i18n/zh.json        Simplified Chinese copy (English source text as the key)
zh/                 GENERATED — do not hand-edit; run `npm run build`
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

## Languages

English lives at `/`, Simplified Chinese at `/zh/`. Both are plain static HTML —
there is no client-side i18n, because most LLM crawlers don't run JS and would
see an untranslated page.

```sh
npm run build     # regenerate zh/index.html
npm run check     # CI guard: fail if zh/index.html is stale
```

`index.html` is the single source of both structure and English copy.
`i18n/zh.json` keys its translations on **the English source text itself**, so
the markup needs no `data-i18n` annotation, and editing an English string
invalidates its key and fails the build naming the string that went stale.
Replacements anchor on tag boundaries (`>text<`, `="value"`), which is why no
HTML parser — and no dependency — is needed.

To add a language: copy `i18n/zh.json`, translate the values, set the `locale`
block, and add the code to `LOCALES` in `build-i18n.mjs`. Then extend the
`hreflang` set in `index.html` and `sitemap.xml`.

Notes:

- Strings `index.js` builds at runtime live in a static `#ui-strings` JSON block
  per page, so the script itself carries no English.
- `assets/agent-session.json` stays English on purpose: it is a verbatim
  transcript of a real Claude session, and translating it would undercut the
  one claim the page most needs to be believed.
- `html[lang^="zh"]` rules at the end of `index.css` supply CJK font fallbacks
  (the mono stack has no Han glyphs at all), drop the synthesized italic Han
  characters don't have, and halve the wide Latin letter-spacing.

## How the media was made (the honest part)

Everything on the page is a real capture of the shipping app, not a mockup:

- `assets/video/agent-session.mp4` — one real agent session, end to end: a
  headless Claude Code agent (`claude -p` + the app's MCP server over
  streamable HTTP) was handed a creative brief and four clips, and built the
  "Aurora Ridge" teaser on its own — imports, placement, split/trim, two
  transitions, a lower third, keyframed fades and a push-in, blur,
  silence-detection, captions, marker, checkpoint. The UI was captured live
  via CDP screencast while the calls landed; think-time between calls is cut
  out of the video (`compose.mjs`), nothing else is altered. It ends with the
  finished cut playing back in the app.
- `assets/agent-session.json` — that session's actual transcript, in the shape
  Claude Code's terminal prints it: the brief, the agent's messages, every tool
  call with its MCP display name and raw params, the `⎿` result block (clipped
  with a "+N lines" tail, errors and recoveries included), and the closing
  summary — timestamps remapped to the compressed video timeline. The page
  replays it as a terminal, synced to the video.
- `assets/video/nle-tour.mp4` — human-style interactions (playback, ruler
  scrub, zoom, blade split, delete, trim, keyframe lanes, effect add,
  Cmd+K → export, log console) driven via CDP input with an in-page cursor.
- `assets/shots/*.webp` — `page.screenshot` stills of the app's panels
  (agent mode, connect-agent snippet, export settings, eyedropper, …).
- `assets/video/motif-showcase.mp4` (+ poster) — a real five-second WeftCut
  export combining Text FX, a lower third, and a countdown. The page plays it
  once when Scene 02 enters view.
- `assets/shots/motif-text-fx.png` — a real transparent Text FX frame retained
  from the Motif capture.
- The demo footage (`aurora` / `ridgeline` / `lakeside` / `embers`) is
  deterministic canvas art: each scene is a `renderFrame(t)` painting
  (aurora curtains over a ridge, a layered-ridge sunrise, a mirror lake, rising
  embers) rendered frame-by-frame in a browser and assembled with ffmpeg over
  synthesized pads — the embers bed carries a deliberate 3.2 s dead-air gap for
  the agent's silence detector to find. See `.work/harness/scenes.html`.

The harness that produced all of this lives in `.work/harness/` (Playwright
`_electron` + a minimal MCP client + ffmpeg screen capture; the hero session
uses the newer `.work/harness/agent-session/` kit instead — CDP screencast
recorder + `claude -p` runner + idle-cut composer). Legacy re-run order:
`agent-demo.mjs` → `nle-tour.mjs` → `screenshots.mjs` → `addendum.mjs` →
`postprocess.mjs`. It requires a WeftCut checkout built with
`npm run build:e2e`. By default the checkout is discovered as a sibling named
`WeftCut`; no workstation-specific paths are required.

Hero-session re-run order (`.work/harness/agent-session/`): generate footage
(`scenes.html` + Playwright frame dump + ffmpeg), launch the app dev build with
`VITE_WEFTCUT_E2E=1 REMOTE_DEBUGGING_PORT=9222`, start `recorder.mjs`, run
`run-agent.sh <run> <model>` (headless Claude Code with the app's MCP snippet),
`outro.sh` to record the finished cut playing, then `compose.mjs` to cut idle
time and emit the final frames plus the timing trace. `tui-trace.mjs` then turns
the raw `run<N>-trace.jsonl` stream into the shipped `agent-session.json`,
taking content from the stream and timestamps from `compose.mjs`'s output
(`shipped-trace.json`) so the panel stays in sync without re-rendering frames:

```sh
node .work/harness/agent-session/tui-trace.mjs \
  .work/harness/agent-session/runs/run4-trace.jsonl \
  .work/harness/agent-session/shipped-trace.json \
  assets/agent-session.json
```

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
