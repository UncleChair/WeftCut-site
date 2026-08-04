#!/bin/bash
# Run the WeftCut editing subagent headless with the weftcut MCP server,
# stamping every stream-json event with an arrival timestamp.
set -uo pipefail
SCRATCH="C:/Users/iClass/AppData/Local/Temp/claude/C--Users-iClass-Desktop-learning-WeftCut-site/a2f63a31-e892-49da-a876-3be684ce2b67/scratchpad"
RUN="${1:?usage: run-agent.sh <run-name> [model]}"
MODEL="${2:-sonnet}"
mkdir -p "$SCRATCH/agent-home" "$SCRATCH/runs/$RUN"
cd "$SCRATCH/agent-home"
echo "$(date +%s%3N) session-start" > "$SCRATCH/runs/$RUN/meta.txt"
claude -p "$(cat "$SCRATCH/agent-prompt.txt")" \
  --mcp-config "$SCRATCH/weftcut-mcp.json" --strict-mcp-config \
  --allowedTools "mcp__weftcut" \
  --disallowedTools "Bash" "PowerShell" "Read" "Write" "Edit" "Glob" "Grep" "WebFetch" "WebSearch" "Task" "TodoWrite" "NotebookEdit" \
  --model "$MODEL" --max-turns 80 \
  --output-format stream-json --verbose \
  2> "$SCRATCH/runs/$RUN/stderr.log" | node "$SCRATCH/stamp.mjs" > "$SCRATCH/runs/$RUN/trace.jsonl"
rc=$?
echo "$(date +%s%3N) session-end rc=$rc" >> "$SCRATCH/runs/$RUN/meta.txt"
exit $rc
