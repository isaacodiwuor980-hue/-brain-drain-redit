#!/bin/bash
# Permanent dev server supervisor — auto-restarts on crash.
# Uses the direct tsx binary path (not npx) to avoid resolution delays.
# The infinite loop restarts the server within 3 seconds if it dies.
cd /home/z/my-project/BRAIN-DRAIN-latest-

TXS_BIN="/home/z/my-project/BRAIN-DRAIN-latest-/node_modules/.bin/tsx"

while true; do
  echo "[$(date)] Starting dev server..." >> /home/z/my-project/dev-supervisor.log
  PORT=3000 NODE_ENV=development "$TXS_BIN" server.ts < /dev/null > /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited (code $EXIT_CODE), restarting in 3s..." >> /home/z/my-project/dev-supervisor.log
  sleep 3
done
