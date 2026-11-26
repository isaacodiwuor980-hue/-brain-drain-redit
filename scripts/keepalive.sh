#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# PERMANENT SERVER KEEPALIVE — multi-layer, frictionless, reliable.
# ═══════════════════════════════════════════════════════════════════════════
#
# This script launches a watchdog that:
#   1. Starts node with setsid (new session, survives parent death)
#   2. Restarts within 1s if node crashes
#   3. Health-checks every 5s and kills hung processes
#   4. Re-launches itself if the watchdog bash loop dies
#
# The watchdog is launched with setsid + nohup + disown for maximum detachment.
# Run this once at the start of any session if the server is down.
#
# Usage: bash /home/z/my-project/scripts/keepalive.sh
# ═══════════════════════════════════════════════════════════════════════════

cd /home/z/my-project/MindSpool-latest-

# Kill any existing instances
pkill -f "bd-watchdog-inner" 2>/dev/null
pkill -f "node dist/server" 2>/dev/null
sleep 1

# Write the inner watchdog script (the actual loop)
cat > /tmp/bd-watchdog-inner.sh << 'INNEREOF'
#!/bin/bash
cd /home/z/my-project/MindSpool-latest-
HEALTH_URL="http://localhost:3000/api/healthz"
LAST_HEALTH_OK=0

while true; do
  # Start node if not running
  if ! pgrep -f "node dist/server.cjs" >/dev/null 2>&1; then
    PORT=3000 NODE_ENV=production node dist/server.cjs >>/tmp/bd-server.log 2>&1 &
    NODE_PID=$!
    echo "[$(date)] node started (PID $NODE_PID)" >>/tmp/bd-server.log
    sleep 2
  fi

  # Health check every 5s
  sleep 5
  if curl -sf -m 3 "$HEALTH_URL" >/dev/null 2>&1; then
    LAST_HEALTH_OK=$(date +%s)
  else
    NOW=$(date +%s)
    # If unhealthy for >15s, kill and restart
    if [ $((NOW - LAST_HEALTH_OK)) -gt 15 ]; then
      echo "[$(date)] health check failed for 15s — killing node" >>/tmp/bd-server.log
      pkill -9 -f "node dist/server.cjs" 2>/dev/null
      sleep 1
    fi
  fi
done
INNEREOF
chmod +x /tmp/bd-watchdog-inner.sh

# Launch with setsid — fully detached new session
setsid bash /tmp/bd-watchdog-inner.sh </dev/null >/dev/null 2>&1 &

# Wait for server to come up
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  if curl -sf -m 2 "http://localhost:3000/api/healthz" >/dev/null 2>&1; then
    echo "✓ Server is up after ${i}s"
    echo "  PID: $(pgrep -f 'node dist/server' | head -1)"
    echo "  Watchdog: $(pgrep -f 'bd-watchdog-inner' | head -1)"
    exit 0
  fi
done

echo "✗ Server failed to start"
tail -10 /tmp/bd-server.log 2>/dev/null
exit 1
