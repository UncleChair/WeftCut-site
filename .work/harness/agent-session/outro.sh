#!/bin/bash
# Record the playback outro after the agent session: seek 0, play ~SECS, pause,
# then stop the recorder. Prints OUTRO_FROM (epoch ms at play start).
set -uo pipefail
RUN="${1:?usage: outro.sh <runDir> [secs]}"
SECS="${2:-18}"
cd "C:\Users\iClass\Desktop\learning\videtor\.scratch\readme-capture"
node cdp.mjs eval "window.__weftcutTest.weftcutSeekUs(0); 'seek0'" > /dev/null
sleep 1.2
START=$(date +%s%3N)
node cdp.mjs eval "document.querySelector('button[aria-label=\"Play / pause\"]').click(); 'play'" > /dev/null
sleep "$SECS"
node cdp.mjs eval "document.querySelector('button[aria-label=\"Play / pause\"]').click(); 'pause'" > /dev/null
sleep 1
touch "$RUN/stop"
echo "OUTRO_FROM=$START"
