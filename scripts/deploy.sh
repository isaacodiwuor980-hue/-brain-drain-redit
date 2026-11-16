#!/bin/bash
# deploy.sh — safe build + graceful restart.
#
# Usage: bash scripts/deploy.sh
#
# This script:
#   1. Builds the new version (vite build + esbuild server).
#   2. Verifies the new dist/server.cjs is valid JS (node --check).
#   3. Kills only the node child (NOT the keep-server-alive wrapper).
#   4. The wrapper auto-restarts node with the new build.
#   5. Polls /api/healthz until the new server is confirmed healthy.
#
# If the build fails or the new server.cjs is invalid, the script
# aborts WITHOUT killing the running server, so the preview stays up
# on the previous build.
#
# If the new server starts but crashes on the first request, the
# wrapper keeps crash-looping — the preview shows errors but the
# wrapper is alive and will recover if you fix the build and re-run
# this script.

set -euo pipefail
cd /home/z/my-project/BRAIN-DRAIN-latest-

LOG=/tmp/bd-server.log
HEALTH_URL=http://localhost:3000/api/healthz

echo "▶ Building…"
if ! npm run build 2>&1 | tail -15; then
  echo "✗ Build failed — keeping the running server on the previous build."
  exit 1
fi

echo "▶ Verifying dist/server.cjs is valid JS…"
if ! node --check dist/server.cjs 2>/dev/null; then
  echo "✗ dist/server.cjs failed syntax check — keeping the running server."
  exit 1
fi

echo "▶ Restarting node (wrapper will auto-restart)…"
# Kill only the node child, NOT the keep-server-alive wrapper.
pkill -f "node dist/server.cjs" 2>/dev/null || true

echo "▶ Waiting for health…"
for i in $(seq 1 20); do
  if curl -sf -m 2 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "✓ Server healthy after ${i}s"
    curl -sS -m 3 "$HEALTH_URL"
    echo
    exit 0
  fi
  sleep 1
done

echo "✗ Server did not become healthy within 20s — check /tmp/bd-server.log"
echo "  (the wrapper is still running and crash-looping; fix the build and re-run)"
tail -10 "$LOG" 2>/dev/null || true
exit 1
