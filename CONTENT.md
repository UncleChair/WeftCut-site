# WeftCut marketing site — shared fact sheet & content spec

This file is the single source of truth for all three design variants. Facts here
come from the WeftCut product repository. Do not invent features.

## Product facts

- Name: **WeftCut** — "A cross-platform desktop video editor where AI agents are first-class citizens."
- One-liner: Connect Claude, Cursor, or any MCP client — and audit its edits to your timeline live.
- Core differentiator (THE story): most editors bolt AI on as a feature. WeftCut
  exposes the editor *as* a tool surface — a localhost MCP server (streamable
  HTTP) with the full catalog of editing tools. The intelligence lives outside;
  the app bundles no models. **Everything an agent can do, you can do** — it is
  also a complete editor for humans.
- Repo: https://github.com/UncleChair/WeftCut (link in nav + footer + OSS section)
- License: MIT (app); bundles FFmpeg (LGPL decode libs / GPL CLI sidecar).
- Platform: desktop, cross-platform (macOS / Windows / Linux), Electron shell.

## Agent capability (section 1 — hero story)

- Built-in MCP server, streamable HTTP on `127.0.0.1:<port>/mcp`, bearer-token
  auth, DNS-rebinding protection, localhost only.
- ~40 tools (66 registered incl. resources/prompts): place/trim/split clips,
  `auto_split_by_shot`, `detect_silences`, restyle titles, keyframes with easing,
  effect chains, groups, markers, captions (`apply_subtitles` SRT/VTT/ASS),
  motifs, checkpoints, undo/redo, `dry_run` validation, multi-agent change feed,
  `begin_agent_session` (UI flips into a simplified agent mode).
- Edits land in the UI in real time — the human keeps editing alongside.
- Optional analysis tools: shot detection, silence detection, frame compare,
  transcription (Whisper / local sidecars), scene description (local VLM first).
- Snippet to connect (Claude Desktop):
```json
{
  "mcpServers": {
    "weftcut": {
      "url": "http://127.0.0.1:50831/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

## NLE capability (section 2 — proof it's a real editor)

- A/B-roll timeline with filmstrips and waveforms; frame-aligned editing with
  SMPTE timecode; blade/trim/move; cross-track groups with auto-paired A/V.
- Keyframes with bézier easing and an in-timeline curve editor.
- Effects: per-layer chains (blur, chroma key with live eyedropper).
- Titles & captions: styled text layers; SRT/VTT/ASS import as editable caption
  layers; corpus-wide restyle in one undo step.
- Motifs: animated parameterized web overlays (lower thirds, countdowns) rendered
  pixel-identically in preview and export.
- Audio: role-based mixing (dialogue/music/effects), gain, pan, fades,
  sample-accurate export via Rust mixer.
- Preview: PixiJS v8 + WebCodecs compositing, Rust decode engine, optional
  proxies, dropped-frame transport indicator.
- Export: H.264 / HEVC / AV1 up to 10-bit, ProRes/DNxHR, hw/sw encoders,
  streamed muxing; export ranges.
- Find anything: Ctrl+K palette over commands/media/clips/captions/markers
  (with pinyin support).

## How it's built (small section)

Electron + React 19 · PixiJS v8 + WebCodecs · Rust core via napi-rs (decode,
audio, jobs, media analysis) · FFmpeg (LGPL in-process decode, GPL CLI encode) ·
mediabunny containers · MCP over streamable HTTP.

## Voice & tone

- **Product page, not tech report.** Surface capabilities only — what the user
  can do, never how it's implemented. No tool/function names, no protocol
  plumbing (tokens, ports, localhost servers), no tech-stack section in visible
  copy. Allowed because users look for them: export formats (H.264/HEVC/AV1/
  ProRes, 10-bit), platforms, MIT/free, "MCP" as a one-word open-standard
  mention, Claude/Cursor as examples.
- Confident, precise, engineer-to-engineer. No hype adjectives. Short sentences.
- Show, then tell: every claim pairs with real footage.
- The synced agent-log replay renders each call's `label` (plain-English action
  description) — never the raw tool name/args.
- English copy. Code identifiers in monospace.

## Required blocks (each variant interprets freely)

1. Nav: wordmark + anchor links + GitHub link w/ star icon.
2. Hero: headline, subhead, primary CTA (GitHub), secondary CTA (Docs), hero
   media (agent demo video) — paired with the synced replay of the real
   `assets/agent-log.json` actions (labels, timestamps, ✓ ms).
3. "Agent-native" section: the differentiator as product promises — connect in
   a minute (Settings → Agent, copy, paste), it edits the real timeline live,
   you're always in control (checkpoint + undo), it can look and listen
   (optional shot/silence/transcription). No JSON snippet, no tool counts.
4. "A complete NLE" section: feature grid with real screenshots/clips.
5. "Open source" section: MIT, clone/build commands, GitHub CTA.
6. Footer: GitHub, docs (link repo /docs), license note, copyright 2026 WeftCut contributors.

## SEO/GEO requirements (all variants)

- Static HTML, zero build step, semantic tags (header/main/section/article/footer,
  one h1, descriptive h2s), fast: no frameworks, vanilla JS only.
- `<title>` + meta description per page; Open Graph + Twitter card meta (use
  assets/shots/editor-hero.png as og:image); canonical link.
- JSON-LD `SoftwareApplication` schema (name, description, applicationCategory
  "MultimediaApplication", operatingSystem "macOS, Windows, Linux", offers free,
  license MIT, url = repo).
- A visible FAQ section (3-5 Q&As, e.g. "Is WeftCut free?", "Which agents can I
  connect?", "Does it work without an agent?", "What platforms?") — good for GEO.
- robots.txt + sitemap.xml at site root (list all three variant URLs).
- Images: width/height attrs, lazy loading below the fold, descriptive alt text.
- Videos: muted+playsinline+loop for ambient, controls for demos, poster attr.

## Brand tokens

- Icon colors: #6696E6 (primary blue), #5B7196 (slate blue).
- App dark palette (from ui-tokens.md): bg #0c0e12, card #111419, popover #1c2028,
  sunken #08090b, raised #181c23, track lane #14171d, border-soft #252a34,
  border #363e4b, ring/accent #3b82f6, success #46c46a, warning #f0a020,
  keyframe-yellow #facc15, destructive #f87171. Radius: 4/6/8px.
- App font stack: UI sans (Inter-ish); use system stacks or self-host nothing —
  system-ui is fine; mono: ui-monospace/SFMono.

## Assets (all under assets/, shared by variants)

- assets/video/agent-session.mp4 (+ .webm, poster agent-session-poster.jpg):
  full agent demo — MCP drives the app live (~46s).
- assets/video/nle-tour.mp4 (+ .webm, poster): human NLE interactions (~53s).
- assets/agent-log.json: the real timed tool-call log of the hero recording.
- assets/shots/*.webp: 1600w screenshots — editor-hero, timeline-closeup, curve-editor,
  effects, search-palette, connect-agent, export, captions, motifs, agent-mode,
  eyedropper, log-console.
- assets/icon.svg: the app icon (copy from repo).
- assets/editor.png, assets/agent-edit.gif, assets/search-palette-doc.png: copies of
  the repo's docs/assets images (already public in the README).

## Final design

**"Cinematic Timeline" (SELECTED — now the site root, `index.html`).** Film-editor
romance: Georgia serif display headlines with letterspaced small-caps kickers,
hairline film-ruler dividers, REEL-numbered sections. Hero: centered copy, then
the agent demo as one unit — bare frameless video (left) beside the synced
action terminal (right), both at matched height in a fixed 2.66:1 unit.
Reel 01 agent-native → Reel 02 "the human cut" (nle-tour) → Reel 03 open
source → FAQ.
