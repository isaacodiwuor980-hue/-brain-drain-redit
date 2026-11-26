-- Identity link storage only: creates no users, mappings, flags, or content.
-- Firebase ownership must be verified by a trusted provisioning process;
-- this table does not itself establish identity or implement provisioning.
DO $$
BEGIN
  IF to_regclass('public.user_identity_map') IS NOT NULL OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Unexpected identity schema; migration stopped';
  END IF;
END $$;
CREATE TABLE public.user_identity_map (
  firebase_subject text PRIMARY KEY CHECK (length(firebase_subject) BETWEEN 1 AND 128 AND firebase_subject ~ '^[A-Za-z0-9_-]+$'),
  supabase_uid uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_identity_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_identity_map FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.user_identity_map TO service_role;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.user_identity_map', 'SELECT')
    OR has_table_privilege('anon', 'public.user_identity_map', 'INSERT')
    OR has_table_privilege('authenticated', 'public.user_identity_map', 'SELECT')
    OR has_table_privilege('authenticated', 'public.user_identity_map', 'INSERT')
    OR has_table_privilege('service_role', 'public.user_identity_map', 'INSERT')
    OR has_table_privilege('service_role', 'public.user_identity_map', 'UPDATE')
    OR has_table_privilege('service_role', 'public.user_identity_map', 'DELETE')
    OR has_table_privilege('service_role', 'public.user_identity_map', 'TRUNCATE')
    OR NOT has_table_privilege('service_role', 'public.user_identity_map', 'SELECT')
  THEN RAISE EXCEPTION 'Unexpected inherited identity-map privileges; migration stopped'; END IF;
END $$;
