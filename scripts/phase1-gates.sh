#!/usr/bin/env bash
# Phase 1 gates — run every check, save full outputs, print compact summary.
# Read-only with respect to source; only writes logs + rebuilds dist/.
set -u
cd /home/z/my-project/MindSpool-latest-
OUT=/home/z/my-project/scripts/phase1-outputs
mkdir -p "$OUT"

echo "=== PHASE 1 GATES $(date -Iseconds) ===" | tee "$OUT/summary.txt"

echo "--- typecheck ---" | tee -a "$OUT/summary.txt"
npx tsc -p tsconfig.json --noEmit > "$OUT/typecheck.txt" 2>&1
TC=$?
echo "typecheck exit=$TC  errors=$(grep -c 'error TS' "$OUT/typecheck.txt" 2>/dev/null || echo 0)" | tee -a "$OUT/summary.txt"

echo "--- lint (eslint) ---" | tee -a "$OUT/summary.txt"
npx eslint . > "$OUT/lint.txt" 2>&1
LI=$?
echo "lint exit=$LI  errors=$(grep -cE '^\s+[0-9]+:[0-9]+\s+error' "$OUT/lint.txt" 2>/dev/null || echo 0)  warnings=$(grep -cE '^\s+[0-9]+:[0-9]+\s+warning' "$OUT/lint.txt" 2>/dev/null || echo 0)" | tee -a "$OUT/summary.txt"

echo "--- tests (vitest) ---" | tee -a "$OUT/summary.txt"
npx vitest run --config vitest.config.ts > "$OUT/tests.txt" 2>&1
TE=$?
echo "tests exit=$TE  failed=$(grep -cE '^ *(✗|×|FAIL)' "$OUT/tests.txt" 2>/dev/null || echo 0)" | tee -a "$OUT/summary.txt"

echo "--- build ---" | tee -a "$OUT/summary.txt"
npm run build > "$OUT/build.txt" 2>&1
BU=$?
echo "build exit=$BU" | tee -a "$OUT/summary.txt"

echo "--- deps: top-level list ---" | tee -a "$OUT/summary.txt"
npm ls --depth=0 > "$OUT/deps-top.txt" 2>&1
echo "npm ls exit=$?" | tee -a "$OUT/summary.txt"

echo "--- deps: duplicate key packages ---" | tee -a "$OUT/summary.txt"
npm ls react react-dom @supabase/supabase-js firebase wouter @tanstack/react-query zod 2>&1 | grep -E "^(├|└|│| [a-z@])" | head -40 > "$OUT/deps-dupes.txt"
grep -c "deduped" "$OUT/deps-dupes.txt" 2>/dev/null || true

echo "--- deps: prod vulnerabilities ---" | tee -a "$OUT/summary.txt"
npm audit --omit=dev > "$OUT/audit.txt" 2>&1
echo "npm audit exit=$?  severity-summary: $(grep -E 'severity|vulnerabilit' "$OUT/audit.txt" | head -3 | tr '\n' ' ')" | tee -a "$OUT/summary.txt"

echo "=== GATES DONE $(date -Iseconds) ===" | tee -a "$OUT/summary.txt"
exit 0
