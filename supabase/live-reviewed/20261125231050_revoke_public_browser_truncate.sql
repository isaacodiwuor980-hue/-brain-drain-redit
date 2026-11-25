-- Restrict TRUNCATE only for observed public browser roles; RLS does not cover
-- TRUNCATE. Does not touch rows, service-role privileges or future tables.
-- Fails as one transaction on missing/unexpected objects or inherited grants.
DO $$
DECLARE
  names text[] := ARRAY['analytics_events','app_admins','brain_nodes','brain_scores','brains','check_ins','comments','communities','community_members','conversation_participants','conversations','experts','follows','habits','mentors','messages','milestones','mission_scores','missions','notifications','onboarding','pathways','post_scores','posts','profiles','reactions','recall_events','reports','reputation','skills','topic_followers','topics','user_follows','user_topic_affinity','xp_events'];
  item text;
  table_oid oid;
BEGIN
  FOREACH item IN ARRAY names LOOP
    SELECT c.oid INTO table_oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=item AND c.relkind IN ('r','p') AND pg_catalog.pg_get_userbyid(c.relowner)='postgres';
    IF table_oid IS NULL THEN RAISE EXCEPTION 'Unexpected or missing table: %', item; END IF;
    EXECUTE format('REVOKE TRUNCATE ON TABLE public.%I FROM PUBLIC, anon, authenticated', item);
    IF has_table_privilege('anon', table_oid, 'TRUNCATE') OR has_table_privilege('authenticated', table_oid, 'TRUNCATE') THEN
      RAISE EXCEPTION 'TRUNCATE remains available through inherited grants on %', item;
    END IF;
  END LOOP;
END $$;
