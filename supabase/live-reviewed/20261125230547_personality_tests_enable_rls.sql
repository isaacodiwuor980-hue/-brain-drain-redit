-- Target: observed public.personality_tests. Keeps existing rows and policies.
-- Recheck assumptions in the transaction; abort if schema or policy drifted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'personality_tests' AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'personality_tests'
      AND a.attname = 'user_id' AND a.atttypid = 'pg_catalog.uuid'::regtype AND NOT a.attisdropped
  ) OR (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'personality_tests') <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'personality_tests' AND policyname = 'personality_tests read own' AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[] AND regexp_replace(qual, '[[:space:]()]', '', 'g') = 'SELECTauth.uidASuid=user_id')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'personality_tests' AND policyname = 'personality_tests write own' AND cmd = 'ALL' AND roles = ARRAY['authenticated']::name[] AND regexp_replace(qual, '[[:space:]()]', '', 'g') = 'SELECTauth.uidASuid=user_id' AND regexp_replace(with_check, '[[:space:]()]', '', 'g') = 'SELECTauth.uidASuid=user_id')
  THEN RAISE EXCEPTION 'personality_tests schema or policy drift; migration stopped'; END IF;
END $$;
ALTER TABLE public.personality_tests ENABLE ROW LEVEL SECURITY;
-- TRUNCATE is not subject to RLS. Deny it to public browser roles, retaining
-- service/owner authority; inherited privileges still require separate audit.
REVOKE TRUNCATE ON public.personality_tests FROM PUBLIC, anon, authenticated;
