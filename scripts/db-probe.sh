#!/bin/bash
# db-probe.sh — diagnostic: count rows in key Supabase tables directly via REST.
# Prints ONLY counts + HTTP status. Never prints keys.
# Usage: bash scripts/db-probe.sh
set -u
cd "$(dirname "$0")/.."

# Load env (SUPABASE_URL, SUPABASE_ANON_KEY) without printing them.
set -a
. ./.env 2>/dev/null
set +a

URL="${SUPABASE_URL}/rest/v1"
KEY="${SUPABASE_ANON_KEY}"

if [ -z "${URL:-}" ] || [ -z "${KEY:-}" ]; then
  echo "✗ SUPABASE_URL or SUPABASE_ANON_KEY missing from .env"
  exit 1
fi

probe() {
  local table="$1"
  local select="${2:-id}"
  # Prefer: count=exact + Range: 0-0 → Content-Range header gives the total count
  # without downloading every row.
  local hdr
  hdr=$(curl -s -m 12 \
    -H "apikey: $KEY" \
    -H "Authorization: Bearer $KEY" \
    -H "Prefer: count=exact" \
    -H "Range: 0-0" \
    -o /dev/null -D - \
    "$URL/$table?select=$select" 2>/dev/null)
  local http
  http=$(echo "$hdr" | grep -E "^HTTP/" | tr -d '\r')
  local cr
  cr=$(echo "$hdr" | grep -i "^content-range:" | tr -d '\r' | sed 's/[Cc]ontent-[Rr]ange: //I')
  if [ -z "$cr" ]; then
    echo "  $table: $http (no content-range — table may be inaccessible)"
  else
    # content-range like "0-0/42" → total is the part after /
    local total="${cr##*/}"
    echo "  $table: $http — total rows: $total"
  fi
}

echo "=== Supabase REST direct probe (row counts) ==="
echo "  endpoint: ${SUPABASE_URL}/rest/v1  (key: ${#KEY} chars, masked)"
echo ""
probe posts
probe reactions
probe profiles
probe topics
probe comments
probe skills
probe brains
echo ""
echo "=== sample: first 3 posts (id, user_id prefix, created_at, post_type) ==="
curl -s -m 12 \
  -H "apikey: $KEY" \
  -H "Authorization: Bearer $KEY" \
  "$URL/posts?select=id,user_id,created_at,post_type&order=created_at.desc&limit=3" 2>/dev/null | head -c 800
echo ""
