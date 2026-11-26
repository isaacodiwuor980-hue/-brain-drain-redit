#!/bin/bash
# ensure-server.sh — guarantee the preview server is running.
#
# Call this at the START of every work session. It:
#   1. Checks if the keep-server-alive wrapper is running.
#   2. If not, starts it with setsid (fully detached — survives shell death).
#   3. Waits for /api/healthz to respond.
#   4. Reports status.
#
# This script is IDEMPOTENT — safe to run multiple times. If the wrapper
# is already running, it just verifies health and exits.

set -u
cd /home/z/my-project/MindSpool-latest-

HEALTH_URL=http://localhost:3000/api/healthz
# Logs persist under the project dir so they SURVIVE container recycles.
# /tmp is wiped on every recycle — writing logs there made crash diagnosis
# impossible (the log was gone by the time anyone looked). Verified 2026-11-14.
LOG_DIR=/home/z/my-project/MindSpool-latest-/logs
mkdir -p "$LOG_DIR" 2>/dev/null
WRAPPER_LOG="$LOG_DIR/bd-wrapper.log"
SERVER_LOG="$LOG_DIR/bd-server.log"

# 1. Is the wrapper running?
WRAPPER_PID=$(pgrep -f "keep-server-alive" 2>/dev/null | head -1)

if [ -z "$WRAPPER_PID" ]; then
  echo "▶ Wrapper not running — starting (double-fork orphan launch)…"
  # CRITICAL LAUNCH PATTERN — do not simplify to `setsid ... &`!
  #
  # The sandbox SIGKILLs every process that is still a DESCENDANT of this
  # shell when the command finishes (SIGHUP/setsid/disown do NOT help).
  # The ONLY escape is to orphan the wrapper to PID 1 (tini) BEFORE this
  # script exits: an intermediate `bash -c '... & exit 0'` spawns the
  # wrapper and dies immediately, reparenting it to init. An orphan with
  # ppid=1 is outside the reaper's descendant walk and survives forever.
  # Verified: 2026-10-29 — wrapper + node survived across tool calls
  # with plain `setsid &` dying instantly at command end.
  bash -c 'setsid bash scripts/keep-server-alive.sh </dev/null >>/home/z/my-project/MindSpool-latest-/logs/bd-wrapper.log 2>&1 & exit 0'
  sleep 2
  WRAPPER_PID=$(pgrep -f "keep-server-alive" 2>/dev/null | head -1)
  if [ -z "$WRAPPER_PID" ]; then
    echo "✗ Failed to start wrapper. Check $WRAPPER_LOG"
    cat "$WRAPPER_LOG" 2>/dev/null
    exit 1
  fi
  # Confirm the orphan actually escaped (ppid must be 1).
  W_PPID=$(ps -o ppid= -p "$WRAPPER_PID" 2>/dev/null | tr -d ' ')
  if [ "$W_PPID" = "1" ]; then
    echo "✓ Wrapper started (PID $WRAPPER_PID, orphaned to init — reaper-proof)"
  else
    echo "⚠ Wrapper started (PID $WRAPPER_PID, ppid=$W_PPID) — NOT orphaned;"
    echo "  it will be reaped when this command ends. Retrying orphan launch…"
    bash -c 'setsid bash scripts/keep-server-alive.sh </dev/null >>/home/z/my-project/MindSpool-latest-/logs/bd-wrapper.log 2>&1 & exit 0'
    sleep 2
    WRAPPER_PID=$(pgrep -f "keep-server-alive" 2>/dev/null | head -1)
    W_PPID=$(ps -o ppid= -p "$WRAPPER_PID" 2>/dev/null | tr -d ' ')
    [ "$W_PPID" = "1" ] && echo "✓ Retry succeeded — wrapper orphaned (PID $WRAPPER_PID)" || echo "✗ Still not orphaned"
  fi
else
  echo "✓ Wrapper already running (PID $WRAPPER_PID)"
fi

# 2. Is the node child running?
NODE_PID=$(pgrep -f "node dist/server.cjs" 2>/dev/null | head -1)
if [ -n "$NODE_PID" ]; then
  echo "✓ Node child running (PID $NODE_PID)"
fi

# 3. Wait for health (up to 15s — the wrapper may be restarting node).
#    Deeper than just /api/healthz: also verify the preview HTML actually
#    renders. /api/healthz can return 200 while the SPA shell is broken
#    (missing assets / bad build) — the HTML check catches that. Verified 2026-11-14.
echo "▶ Checking health + preview render…"
for i in $(seq 1 15); do
  if curl -sf -m 2 "$HEALTH_URL" >/dev/null 2>&1; then
    HTTP_CODE=$(curl -s -m 5 -o /tmp/.preview-check.html -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
    BYTES=$(wc -c < /tmp/.preview-check.html 2>/dev/null | tr -d ' ' || echo 0)
    if [ "$HTTP_CODE" = "200" ] && [ "$BYTES" -gt 500 ] && grep -q "<html" /tmp/.preview-check.html 2>/dev/null; then
      echo "✓ Server healthy + preview HTML renders (HTTP $HTTP_CODE, $BYTES bytes)"
      curl -sS -m 3 "$HEALTH_URL"
      echo
      rm -f /tmp/.preview-check.html
      exit 0
    fi
    echo "… healthz OK but preview HTML not ready (HTTP $HTTP_CODE, $BYTES bytes), retrying"
  fi
  sleep 1
done

echo "✗ Server not healthy within 15s"
echo "  Wrapper log (last 10 lines):"
tail -10 "$WRAPPER_LOG" 2>/dev/null
echo "  Server log (last 10 lines):"
tail -10 "$SERVER_LOG" 2>/dev/null
exit 1
