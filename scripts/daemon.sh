#!/bin/bash
# Double-fork daemon — creates a true daemon that survives session cleanup.
cd /home/z/my-project/BRAIN-DRAIN-latest-
pkill -f "node dist/server.cjs" 2>/dev/null
sleep 1

# Create the watchdog script that will run inside the daemon
cat > /tmp/bd-watchdog.sh << 'EOF'
#!/bin/bash
cd /home/z/my-project/BRAIN-DRAIN-latest-
while true; do
  PORT=3000 NODE_ENV=production node dist/server.cjs >>/tmp/bd-server.log 2>&1
  echo "[$(date)] node exited ($?) — restarting in 1s" >>/tmp/bd-server.log
  sleep 1
done
EOF
chmod +x /tmp/bd-watchdog.sh

# Launch with setsid — creates a new session, fully detached
setsid /tmp/bd-watchdog.sh </dev/null >/dev/null 2>&1 &
exit 0
