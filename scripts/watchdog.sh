#!/bin/bash
# Permanent watchdog — restarts node forever. Uses setsid for full detachment.
cd /home/z/my-project/BRAIN-DRAIN-latest-
pkill -f "node dist/server" 2>/dev/null
sleep 1
setsid bash -c '
  cd /home/z/my-project/BRAIN-DRAIN-latest-
  while true; do
    PORT=3000 NODE_ENV=production node dist/server.cjs >>/tmp/bd-server.log 2>&1
    echo "[$(date)] node exited ($?) — restarting in 1s" >>/tmp/bd-server.log
    sleep 1
  done
' </dev/null >/dev/null 2>&1 &
exit 0
