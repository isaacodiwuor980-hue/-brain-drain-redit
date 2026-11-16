#!/bin/bash
# debug-watch.sh — start the wrapper and observe node's behavior for 15s.
# Kills existing bd procs first (scanning ps, excluding self to avoid the
# pgrep -f self-match footgun). Truncates the server log so we see only
# this run's events.
set -u
cd /home/z/my-project/BRAIN-DRAIN-latest-

self=$$
echo "▶ killing existing bd procs (excluding self=$self)…"
for p in $(ps -eo pid,cmd | grep -E "keep-server-alive.sh|dist/server.cjs" | grep -v grep | awk '{print $1}'); do
  [ "$p" = "$self" ] && continue
  kill -9 "$p" 2>/dev/null && echo "  killed $p"
done
sleep 2

# Fresh log so we only see this run.
: > logs/bd-server.log

echo "▶ starting wrapper…"
bash -c 'setsid bash scripts/keep-server-alive.sh </dev/null >>logs/bd-wrapper.log 2>&1 & exit 0'
sleep 2

echo "▶ observing for 15s (log + process tree every 5s)…"
for i in 1 2 3; do
  sleep 5
  echo ""
  echo "--- t=$((i*5))s: server log tail ---"
  tail -8 logs/bd-server.log 2>/dev/null
  echo "--- procs ---"
  ps -eo pid,ppid,etimes,cmd | grep -E "keep-server-alive|dist/server.cjs" | grep -v grep || echo "  [no bd procs]"
done

echo ""
echo "▶ final health + feed check"
curl -s -m 5 http://localhost:3000/api/healthz 2>&1 | head -c 200
echo ""
curl -s -m 8 -o /dev/null -w "feed: HTTP %{http_code}, %{time_total}s\n" "http://localhost:3000/api/feed?mode=foryou&limit=20" 2>&1
