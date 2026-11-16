#!/bin/bash
cd /home/z/my-project/BRAIN-DRAIN-latest-

# PERMANENT FIX: Run the PRODUCTION server instead of the Vite dev server.
# The production server (dist/server.cjs) serves pre-built static files
# + Express API routes. No Vite, no tsx, no HMR websocket, no on-demand
# compilation — just a plain Node.js HTTP server that is extremely stable.
#
# If code changes are needed later, rebuild with `bun run build` then
# restart this script.

# Ensure the build exists
if [ ! -f dist/server.cjs ]; then
  echo "Building production bundle..."
  bun run build
fi

# Start the production server
PORT=3000 NODE_ENV=production node dist/server.cjs < /dev/null > /home/z/my-project/dev.log 2>&1 &
