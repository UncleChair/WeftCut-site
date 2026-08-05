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
build-md.mjs        generates index.md / zh/index.md from the built HTML
i18n/zh.json        Simplified Chinese copy (English source text as the key)
zh/                 GENERATED — do not hand-edit; run `npm run build`
index.md            GENERATED — the page as Markdown, for agents
assets/             shared media: real screen recordings, screenshots, agent log
assets/fonts/       GENERATED — the Chinese heading face, see Fonts below
serve.mjs           zero-dependency node static server (with Range support for video seeks)
build-dist.mjs      assembles dist/ (the deploy bundle) from an allowlist, then link-checks it
worker.js           the one piece of server code: Accept: text/markdown negotiation
wrangler.jsonc      Cloudflare Workers config — static assets + that one Worker
_headers            response headers Cloudflare applies to the deployed site
.well-known/        agent discovery documents, see Agent discovery below
dist/               GENERATED — do not commit; run `npm run dist`
package.json        npm start
robots.txt          crawl rules + Content-Signal usage preferences
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

The site runs on Cloudflare Workers static assets. Cloudflare resolves directory
URLs to `index.html`, which is what `/zh/` depends on.

There is exactly one piece of server code, `worker.js`, and `run_worker_first` in
`wrangler.jsonc` scopes it to the four HTML routes. Everything else — every
image, font and video, which is essentially all the traffic — is served straight
from the edge without entering the Worker, so it doesn't bill against the Workers
request quota. Keep it that way: if a new route needs the Worker, add it to that
list rather than switching `run_worker_first` to `true`.

```sh
npm run dist       # assemble + verify dist/ without publishing
npm run preview    # same, then serve it through the local Workers runtime
npm run deploy     # same, then publish
```

`deploy` gates on `npm run check` first, so a stale `zh/index.html` or
`index.md` stops the release rather than shipping.

The repo root is the site root, which is what lets `npm start` work with no build
step — but it can't be handed to a CDN as-is (`.work/` alone is 130 MB of raw
captures, and `README.md` / `CONTENT.md` are working notes). So `build-dist.mjs`
copies an explicit allowlist into `dist/` and then link-checks the result: every
root-absolute URL in the shipped HTML/CSS/JS has to resolve inside `dist/`. A new
file has to be named in `SHIP` before it can reach production, and forgetting one
fails the build naming the dead link instead of publishing a page with a hole in
it.

Canonical + OG URLs, `sitemap.xml` and `robots.txt` all use the production domain
`https://weftcut.com`. If it ever changes, replace it in all three places and
rerun `npm run build`.

### Domain

`weftcut.com` is registered at Dynadot with its nameservers delegated to
Cloudflare, so the zone is managed entirely from the Cloudflare dashboard. Two
pieces live outside this repo:

- The apex custom domain is bound by the `routes` block in `wrangler.jsonc`.
  Cloudflare creates and owns that DNS record — don't also add an apex `A`/`AAAA`
  record by hand.
- `www` → apex is a **Redirect Rule** in the dashboard, not a `_redirects` entry:
  `_redirects` matches on path only and can't act on the hostname.

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
`hreflang` set in `index.html` and `sitemap.xml`, and add the page to `PAGES` in
`build-md.mjs`.

Notes:

- Strings `index.js` builds at runtime live in a static `#ui-strings` JSON block
  per page, so the script itself carries no English.
- `assets/agent-session.json` stays English on purpose: it is a verbatim
  transcript of a real Claude session, and translating it would undercut the
  one claim the page most needs to be believed.
- `html[lang^="zh"]` rules at the end of `index.css` supply CJK font fallbacks
  (the mono stack has no Han glyphs at all), drop the synthesized italic Han
  characters don't have, and halve the wide Latin letter-spacing.

## Agent discovery

A page arguing that agents should be first-class citizens ought to be legible to
one. Five things are published for that, and all of them are checked by the
build rather than trusted:

| What | Where | Notes |
| --- | --- | --- |
| Usage preferences | `robots.txt` | `Content-Signal: ai-train=yes, search=yes, ai-input=yes` — permissive on purpose, see the comment in the file |
| Markdown of the page | `index.md`, `/zh/index.md` | generated by `build-md.mjs`; also served at `/` and `/zh/` under `Accept: text/markdown` |
| Typed links | `_headers` | RFC 8288 `Link` on the pages *and* their Markdown twins |
| API catalog + server card | `.well-known/api-catalog`, `.well-known/mcp/server-card.json` | RFC 9727 linkset; the card describes the editor's real localhost MCP server |
| Skills | `.well-known/agent-skills/` | discovery index plus `weftcut-mcp/SKILL.md` |
| In-page tools | `index.js` | WebMCP: five read-only tools over what the page already publishes |

Three things are worth knowing before changing any of it.

**The Markdown is negotiated, not converted at the edge.** Cloudflare's Markdown
for Agents does not cover Workers static assets, so `worker.js` does it: an
`Accept: text/markdown` that outranks `text/html` gets `index.md` back at the
page's own URL, with `Vary: Accept` and an `x-markdown-tokens` estimate. Browsers
send `*/*;q=0.8` and never name `text/markdown`, so they always get the page.
`serve.mjs` imports the same rule from `worker.js`, so `npm start` behaves like
production.

**`build-md.mjs` is strict on purpose.** It knows the elements `index.html`
actually uses and fails the build on anything else, so new markup can't quietly
disappear from what agents read. If it stops on an element, teach it that
element — don't widen the check.

**Skill digests are verified at build time.** `.well-known/agent-skills/index.json`
publishes a `sha256:` for every skill, and `build-dist.mjs` recomputes it. Edit a
`SKILL.md` without updating the index and the deploy fails naming both hashes.

### Deliberately not published

`/.well-known/openid-configuration`, `/.well-known/oauth-authorization-server`,
`/.well-known/oauth-protected-resource` and `/auth.md` are all absent, and should
stay absent. This site has no API, no accounts and nothing to authenticate
against; WeftCut's MCP server is bearer-authenticated but binds to loopback
inside the desktop app and has no authorization server to discover. Stub metadata
pointing at token endpoints that don't exist is worse than none — it sends agents
into a handshake that can only fail.

### DNS, and what's still outstanding

Two DNS items can't be done from this repo. Both live in the Cloudflare dashboard
for the `weftcut.com` zone, and one also needs the registrar.

**DNSSEC is off.** The zone publishes no `DNSKEY` and `com.` holds no `DS`, so
every answer for this domain is unauthenticated. This is worth fixing on its own
merits, independently of anything agent-related:

1. Cloudflare dashboard → `weftcut.com` → **DNS → Settings → DNSSEC → Enable**.
2. Copy the `DS` record Cloudflare generates.
3. Add it at **Dynadot** (the registrar) under the domain's DNSSEC settings.
4. Confirm with `dig +dnssec weftcut.com` — the `ad` flag should be set, or
   check `https://dnsviz.net/d/weftcut.com/dnssec/`.

**DNS-AID records are absent.** Worth being clear-eyed here: an audit may report
these as "found but not DNSSEC-validated", but nothing is published —
`_index._agents.weftcut.com` and `_a2a._agents.weftcut.com` both return NODATA.
More to the point, DNS-AID is `draft-mozleywilliams-dnsop-dnsaid-02`, an
individual Internet-Draft that states it "is not endorsed by the IETF and has no
formal standing in the IETF standards process" — and its purpose is to advertise
*reachable* agent endpoints, which this site does not have. The MCP server runs
on loopback inside the desktop app; there is nothing at a public hostname to
point a `SVCB` record at.

If it's still wanted, the only honest record is an index pointing at the
discovery documents that do exist, published as ServiceMode `SVCB` and signed
once DNSSEC is on:

```
_index._agents.weftcut.com. 3600 IN SVCB 1 weftcut.com. (
    alpn="h2,h3"
    port=443
    well-known="api-catalog" )
```

Do DNSSEC first — an unsigned DNS-AID record fails the check it exists to pass.

## Fonts

The page uses system fonts everywhere except one: the Chinese headings.

Georgia is the Latin display face and carries no Han glyphs, so without help the
Chinese headings resolve to whatever the OS supplies — Songti SC on macOS,
SimSun on Windows, a coin toss on Linux. One self-hosted subset makes the
headline look the same everywhere.

```sh
python .work/harness/fonts.py           # rebuild assets/fonts/ (needs zh/ built first)
python .work/harness/fonts.py --check   # CI guard: fail if the font is stale
```

The face is **霞鹜文楷 GB Medium** (LXGW WenKai GB, OFL-1.1). Three choices worth
recording:

- **GB, not the original.** LXGW WenKai derives from FONTWORKS' Klee One and
  carries Japanese glyph forms for most shared characters — 46 of the 71 hanzi
  in this page's h1/h2 are drawn differently. The GB edition uses mainland forms.
- **Medium, mapped to weight 400.** Every `var(--serif)` consumer is weight 400.
  The heavier cut is there because Georgia is a sturdy low-contrast serif and the
  Regular cut reads thin beside it on a dark ground — not to serve `font-weight: 500`.
- **CJK-only subset.** Latin inside a heading still falls through to Georgia,
  which is the pairing the design wants.

The subset is exact — built from the Chinese headings actually on the page, so
161 glyphs and **33 KB**, preloaded on `/zh/` and never requested by `/`. It must
be rebuilt whenever those headings change; `--check` is the guard. Upstream's
25 MB TTF caches in `.work/fonts/` (gitignored) and re-downloads on demand.

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
