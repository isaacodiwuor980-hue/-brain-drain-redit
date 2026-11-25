-- SYNTHETIC REHEARSAL ONLY. Do not apply this file to any live project.
-- Assumes the observed policy and no other permissive policies or inherited
-- grants; neither assumption establishes the live effective authorization.
-- Preserves participant reads; only follower may insert/delete; no UPDATE.
-- Does not address service-role bypass, old application code, identity mapping,
-- counters, triggers, other policies, or migration of existing follow records.
DROP POLICY "user_follows owner" ON public.user_follows;
CREATE POLICY "user_follows participant read" ON public.user_follows
  FOR SELECT TO authenticated
  USING (follower_id = (SELECT auth.uid())::text OR followee_id = (SELECT auth.uid())::text);
CREATE POLICY "user_follows follower insert" ON public.user_follows
  FOR INSERT TO authenticated
  WITH CHECK (follower_id = (SELECT auth.uid())::text);
CREATE POLICY "user_follows follower delete" ON public.user_follows
  FOR DELETE TO authenticated
  USING (follower_id = (SELECT auth.uid())::text);
