#!/usr/bin/env bash
# Stability soak: mixed traffic for N seconds; verify server never dies.
set -u
DURATION=${1:-120}
END=$(( $(date +%s) + DURATION ))
i=0
while [ "$(date +%s)" -lt "$END" ]; do
  for path in "/" "/api/healthz" "/api/feed?mode=foryou&limit=5" "/search" "/api/topics?limit=3"; do
    curl -s -m 10 -o /dev/null "http://localhost:3000$path" &
    i=$((i+1))
  done
  wait
  sleep 0.2
done
echo "soak: $i requests fired"
curl -s -m 5 -o /dev/null -w "post-soak healthz: HTTP %{http_code}\n" http://localhost:3000/api/healthz
