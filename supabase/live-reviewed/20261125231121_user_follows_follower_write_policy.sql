-- Preserve existing rows and participant reads. Direct authenticated writes
-- are follower-only. No UPDATE policy. Service-role bypass is unchanged.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='user_follows' AND c.relkind='r' AND c.relrowsecurity AND pg_catalog.pg_get_userbyid(c.relowner)='postgres')
     OR (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='user_follows') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='user_follows' AND policyname='user_follows owner' AND cmd='ALL' AND roles=ARRAY['authenticated']::name[] AND regexp_replace(qual, '[[:space:]()]', '', 'g') = 'follower_id=auth.uid::textORfollowee_id=auth.uid::text' AND regexp_replace(with_check, '[[:space:]()]', '', 'g') = 'follower_id=auth.uid::textORfollowee_id=auth.uid::text')
  THEN RAISE EXCEPTION 'user_follows schema or policy drift; migration stopped'; END IF;
END $$;
DROP POLICY "user_follows owner" ON public.user_follows;
CREATE POLICY "user_follows participant read" ON public.user_follows FOR SELECT TO authenticated
  USING (follower_id = (SELECT auth.uid())::text OR followee_id = (SELECT auth.uid())::text);
CREATE POLICY "user_follows follower insert" ON public.user_follows FOR INSERT TO authenticated
  WITH CHECK (follower_id = (SELECT auth.uid())::text);
CREATE POLICY "user_follows follower delete" ON public.user_follows FOR DELETE TO authenticated
  USING (follower_id = (SELECT auth.uid())::text);
