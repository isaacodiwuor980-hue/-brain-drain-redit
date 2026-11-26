-- MindSpool — seed data (idempotent)
-- Run with: psql "$DATABASE_URL" -f supabase/seeds/001_seed_data.sql
-- Or via Supabase Studio SQL editor.
--
-- All inserts use ON CONFLICT DO NOTHING so re-running is safe.

-- ── Topics ──────────────────────────────────────────────────────────────────
insert into public.topics (id, name, description, category, "order") values
  ('ai-safety', 'AI Safety', 'Alignment, interpretability, and governance of AI systems', 'Technology', 1),
  ('health', 'Health & Medicine', 'Evidence-based health, nutrition, and medical decision-making', 'Health', 2),
  ('finance', 'Personal Finance', 'Investing, saving, and financial planning', 'Finance', 3),
  ('career', 'Career & Work', 'Professional growth, job changes, and workplace decisions', 'Career', 4),
  ('relationships', 'Relationships', 'Family, dating, and social dynamics', 'Life', 5),
  ('creativity', 'Creativity & Design', 'Art, writing, product design, and creative process', 'Creativity', 6)
on conflict (id) do nothing;

-- ── Default profile fields are created by the app on first sign-in via
--    Firestore sync. The profiles table is populated client-side through
--    the API server's /posts endpoint which validates auth.uid ownership.
--    No seed profiles are needed here.

-- ── Verify ──────────────────────────────────────────────────────────────────
select 'topics' as table_name, count(*) as rows from public.topics;
