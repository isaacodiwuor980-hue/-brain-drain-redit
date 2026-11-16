#!/usr/bin/env bash
# backup-supabase.sh — logical backup of all public tables to a timestamped file.
#
# Uses pg_dump against the Supabase Postgres connection string. The connection
# string is derived from SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY via the
# Supabase REST API's /rest/v1/ endpoint — but for pg_dump we need the
# direct Postgres URL. Set SUPABASE_DB_URL in .env:
#   postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
#
# Usage:
#   SUPABASE_DB_URL=postgresql://... bash scripts/backup-supabase.sh
#
# Restore:
#   psql "$SUPABASE_DB_URL" -f backups/backup-YYYYMMDD-HHMMSS.sql
#
# Schedule via cron for daily backups:
#   0 3 * * * cd /app && bash scripts/backup-supabase.sh >> /var/log/backup.log 2>&1

set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required (postgresql://postgres:PASS@db.PROJECT.supabase.co:5432/postgres)}"

BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date -u +"%Y%m%d-%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup-$TIMESTAMP.sql"

echo "▶ Backing up Supabase database to $BACKUP_FILE…"

pg_dump \
  --no-owner \
  --no-privileges \
  --format=plain \
  --file="$BACKUP_FILE" \
  "$SUPABASE_DB_URL"

# Compress to save disk space (typical 10:1 ratio).
gzip -f "$BACKUP_FILE"
COMPRESSED="$BACKUP_FILE.gz"

# Retention: keep the last 30 backups. Older backups are deleted.
ls -t "$BACKUP_DIR"/backup-*.sql.gz | tail -n +31 | xargs -r rm -
KEEP_COUNT=$(ls -1 "$BACKUP_DIR"/backup-*.sql.gz | wc -l)

SIZE=$(du -h "$COMPRESSED" | cut -f1)
echo "✓ Backup complete: $COMPRESSED ($SIZE)"
echo "  Retention: $KEEP_COUNT backups in $BACKUP_DIR/"
