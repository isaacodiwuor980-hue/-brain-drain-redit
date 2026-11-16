#!/bin/bash
cd /home/z/my-project/BRAIN-DRAIN-latest-

# REBUILD + RESTART: Use this after making code changes.
# 1. Kill the production server
# 2. Rebuild the production bundle
# 3. Start the production server fresh

# Kill existing server
for d in /proc/[0-9]*; do
  if [ -r "$d/cmdline" ]; then
    cmd=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null)
    if echo "$cmd" | grep -qE "dist/server|tsx.*server"; then
      kill -9 $(basename $d) 2>/dev/null
    fi
  fi
done

sleep 2

# Rebuild
echo "Building..."
bun run build

# Start production server
PORT=3000 NODE_ENV=production node dist/server.cjs < /dev/null > /home/z/my-project/dev.log 2>&1 &
