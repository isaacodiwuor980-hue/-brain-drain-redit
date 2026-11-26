-- Additive post tag storage. REVIEW ONLY: inspect the actual posts schema,
-- grants, backups and migration history before applying to isolated staging.
-- Empty array means no tags, not inferred interests or verified expertise.
-- Existing rows are preserved. No data is read or backfilled from clients.
-- Rollback requires restoring the pre-change API first. Dropping the column
-- destroys stored tags; do not drop without authorization and verified backup.
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
