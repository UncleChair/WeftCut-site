---
name: weftcut-mcp
description: Connect to a running WeftCut desktop video editor over MCP and drive real edits — place, trim and split clips, keyframes, effect chains, captions, motifs, markers, checkpoints and undo. Use when the user asks you to edit video in WeftCut, wants their timeline changed, or asks how to wire an MCP client up to WeftCut.
license: MIT
---

# Editing video in WeftCut over MCP

WeftCut is a cross-platform desktop NLE that exposes the whole editor as an MCP
tool surface. You are not generating a file and handing it over: your calls land
in a running editor's UI in real time, and a human is watching the timeline
while you work.

## Connecting

The server is **not hosted**. It runs inside the desktop app, binds to loopback
only, and picks a port at startup, so there is no fixed endpoint to discover and
nothing to authenticate against remotely.

1. The user opens WeftCut and goes to **Settings → Agent**.
2. That panel prints a ready-to-paste client config with the live port and the
   per-install bearer token.
3. It looks like this:

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

Transport is streamable HTTP. The port in that snippet is an example — always
use the one the app shows. The server refuses non-loopback origins and is
protected against DNS rebinding, so it cannot be reached from a web page.

If the connection fails, the app is almost certainly not running, or the token
was regenerated. Ask the user to re-open Settings → Agent rather than guessing
ports.

## Working with the timeline

Call `begin_agent_session` first. The UI flips into a simplified agent mode that
makes your edits legible to the person watching, and it opens a change feed that
keeps multiple agents and the human from stepping on each other.

Then work in the editor's own vocabulary. The surface is roughly 40 tools (66
registered entries once resources and prompts are counted):

- **Assembly** — place, trim, split and move clips on an A/B-roll timeline.
  Editing is frame-aligned and addressed in SMPTE timecode, not seconds.
- **Cutting help** — `auto_split_by_shot` for shot boundaries,
  `detect_silences` for dead air.
- **Motion** — keyframes with bézier easing.
- **Look** — per-layer effect chains, including chroma key.
- **Words** — `apply_subtitles` imports SRT, VTT or ASS as editable caption
  layers; titles restyle corpus-wide in a single undo step.
- **Graphics** — Motifs, parameterized animated overlays such as lower thirds
  and countdowns, rendered identically in preview and export.
- **Navigation and safety** — markers, groups, checkpoints, undo/redo.

Optional analysis tools cover shot detection, silence detection, frame compare,
transcription, and scene description. These run locally on the user's machine.
WeftCut bundles no models of its own — you are the intelligence in the loop.

## Rules that matter here

**Validate before you mutate.** Destructive or wide-reaching operations accept
`dry_run`. Use it, read back what would change, and only then commit. A bad
batch edit on someone's timeline is expensive to unpick even with undo.

**Checkpoint before a batch.** Take a checkpoint before any multi-step
restructure so the human has one clean thing to roll back to.

**Do not fight the human.** They are editing in the same document while you
work. Watch the change feed. If a clip you were about to touch just moved, re-read
its state instead of writing over their edit.

**Prefer the editor's semantics over raw math.** Ask for a split at a timecode,
not a byte offset. The tools already know about frame boundaries, paired A/V
groups, and caption layers; hand-rolling around them produces edits that look
right in a data structure and wrong on screen.

## Links

- Product: https://weftcut.com/
- MCP reference: https://github.com/UncleChair/WeftCut/blob/main/docs/mcp.md
- Source (MIT): https://github.com/UncleChair/WeftCut
