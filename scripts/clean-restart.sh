#!/bin/bash
# clean-restart.sh — kill all MindSpool server processes (wrapper + node),
# verify clean, then start fresh via ensure-server.sh.
#
# WHY THIS EXISTS: killing via an inline `pgrep -f "keep-server-alive.sh"`
# self-matches the running shell (its cmdline contains that string) and
# kills the shell mid-command. Running from a script file avoids that —
# the script runner's cmdline is `bash scripts/clean-restart.sh`, which
# contains neither search pattern. Verified 2026-11-14.
set -u
cd /home/z/my-project/MindSpool-latest-

echo "▶ killing wrapper(s)…"
for p in $(pgrep -f "keep-server-alive.sh" 2>/dev/null); do
  kill -9 "$p" 2>/dev/null && echo "  killed wrapper $p"
done

echo "▶ killing node server (real node procs running server.cjs)…"
# Only kill processes whose comm is actually "node" — avoids matching the
# wrapper bash script (whose text contains "node dist/server.cjs").
for p in $(pgrep -f "dist/server.cjs" 2>/dev/null); do
  comm=$(cat /proc/"$p"/comm 2>/dev/null)
  if [ "$comm" = "node" ]; then
    kill -9 "$p" 2>/dev/null && echo "  killed node $p"
  fi
done

sleep 3

echo "▶ verify clean…"
if pgrep -f "keep-server-alive.sh" >/dev/null 2>&1; then
  echo "  ⚠ wrapper still present:"
  pgrep -af "keep-server-alive.sh"
else
  echo "  ✓ no wrapper"
fi
if ss -tlnp 2>/dev/null | grep -q ":3000 "; then
  echo "  ⚠ port 3000 still bound"
else
  echo "  ✓ port 3000 free"
fi

echo "▶ fresh start via ensure-server.sh…"
bash scripts/ensure-server.sh
