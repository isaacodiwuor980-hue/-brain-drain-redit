#!/bin/bash
# keep-server-alive.sh — auto-restarting server wrapper with health checks.
#
# This script keeps the production server running permanently. It does
# TWO things:
#   1. Restarts node within 1s if the process crashes.
#   2. Every 60s, checks /api/healthz. If it doesn't respond within 5s
#      (process is hung/zombied), kills node so the wrapper restarts it.
#
# Usage:
#   bash -c 'setsid bash scripts/keep-server-alive.sh </dev/null >>/tmp/bd-wrapper.log 2>&1 & exit 0'  # double-fork — MUST be orphaned to PID 1 or the sandbox reaper kills it
#
# To deploy a new build:
#   1. bun run build
#   2. bash scripts/deploy.sh  (syntax-checks, kills node, waits for health)

set -u
cd /home/z/my-project/BRAIN-DRAIN-latest-

# Logs persist under the project dir so they SURVIVE container recycles.
# /tmp is wiped on every recycle — persisting logs here means crash history
# is diagnosable after the fact (which it wasn't before). Verified 2026-11-14.
LOG_DIR=/home/z/my-project/BRAIN-DRAIN-latest-/logs
mkdir -p "$LOG_DIR" 2>/dev/null
LOG="$LOG_DIR/bd-server.log"
# Cap log size — logs now persist across recycles, so trim to the last 2000
# lines whenever the file exceeds 5000 lines (prevents unbounded growth over
# many keepalive cycles). Runs once per wrapper start.
if [ -f "$LOG" ]; then
  LINE_COUNT=$(wc -l < "$LOG" 2>/dev/null | tr -d ' ')
  if [ -n "$LINE_COUNT" ] && [ "$LINE_COUNT" -gt 5000 ]; then
    tail -2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
fi
HEALTH_URL=http://localhost:3000/api/healthz
HEALTH_CHECK_INTERVAL=60   # seconds between health checks
HEALTH_TIMEOUT=5           # seconds to wait for a health response

echo "[$(date -Iseconds)] keep-server-alive wrapper started (with health checks)" >> "$LOG"

while true; do
  # Start the server.
  PORT=3000 NODE_ENV=production node dist/server.cjs >> "$LOG" 2>&1 &
  NODE_PID=$!
  echo "[$(date -Iseconds)] node started (PID $NODE_PID)" >> "$LOG"

  # Wait for node to exit OR for a health-check failure to kill it.
  # We poll every 5s (not once per HEALTH_CHECK_INTERVAL) so that a
  # deploy.sh kill is noticed within ≤5s — with the old 60s monolithic
  # sleep the wrapper slept right through deploys and the preview was
  # down for up to a full minute. The full health check still runs every
  # 60s (every 12th tick).
  TICKS_PER_HEALTH_CHECK=$((HEALTH_CHECK_INTERVAL / 5))
  tick=0
  while kill -0 "$NODE_PID" 2>/dev/null; do
    sleep 5
    tick=$((tick + 1))
    # If the process is still alive, do a health check every 60s.
    if kill -0 "$NODE_PID" 2>/dev/null && [ $((tick % TICKS_PER_HEALTH_CHECK)) -eq 0 ]; then
      if ! curl -sf -m "$HEALTH_TIMEOUT" "$HEALTH_URL" >/dev/null 2>&1; then
        echo "[$(date -Iseconds)] health check failed — killing hung node (PID $NODE_PID)" >> "$LOG"
        kill -9 "$NODE_PID" 2>/dev/null || true
        break
      fi
    fi
  done

  wait "$NODE_PID" 2>/dev/null
  EXIT_CODE=$?
  echo "[$(date -Iseconds)] node exited (code $EXIT_CODE) — restarting in 1s" >> "$LOG"
  sleep 1
done
