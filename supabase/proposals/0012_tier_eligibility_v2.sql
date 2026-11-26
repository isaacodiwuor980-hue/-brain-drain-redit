-- REVIEW AND LOCAL TESTING ONLY. Do not apply to Supabase without a reviewed
-- forward-migration plan, backups, isolated PostgreSQL tests and approval.
-- Depends on 0011 and verified identity mapping. This is NOT a stake ledger,
-- replay/order protection, account-age gate, fraud defense or live route.
-- Existing set_tiered_post_vote is intentionally unchanged.
CREATE OR REPLACE FUNCTION public.set_tiered_post_vote_v2(
  p_subject text, p_post_id text, p_direction text, p_tier text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_uid uuid; v_topic text; v_score numeric; v_required numeric;
BEGIN
  IF p_subject IS NULL OR p_subject = '' OR p_post_id IS NULL OR p_post_id = '' OR
     (p_direction IS NULL AND p_tier IS NOT NULL) OR
     (p_direction IS NOT NULL AND (p_direction NOT IN ('upvote','downvote') OR
       p_tier IS NULL OR p_tier NOT IN ('mouth','lunch','house','life'))) THEN
    RAISE EXCEPTION 'Invalid tiered vote' USING ERRCODE = '22023';
  END IF;
  SELECT supabase_uid INTO v_uid FROM public.user_identity_map WHERE firebase_subject = p_subject;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Identity mapping required' USING ERRCODE = '42501'; END IF;
  -- Use the same per-user/post lock as the legacy setter. It serializes only
  -- callers that participate in that convention, not existing REST writers.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_post_id, 0));
  SELECT topic_id INTO v_topic FROM public.posts WHERE id = p_post_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found' USING ERRCODE = 'P0002'; END IF;
  IF p_direction IS NOT NULL THEN
    SELECT authority_score INTO v_score FROM public.topic_authority_grants
      WHERE user_id = v_uid AND topic_id = v_topic AND revoked_at IS NULL FOR SHARE;
    IF NOT FOUND THEN v_score := 0.1; END IF;
    v_required := CASE p_tier WHEN 'mouth' THEN 0.1 WHEN 'lunch' THEN 0.35
      WHEN 'house' THEN 0.55 WHEN 'life' THEN 0.75 END;
    IF v_score < v_required THEN RAISE EXCEPTION 'Tier not permitted' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN public.set_tiered_post_vote(p_subject, p_post_id, p_direction, p_tier);
END $$;
REVOKE ALL ON FUNCTION public.set_tiered_post_vote_v2(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_tiered_post_vote_v2(text,text,text,text) TO service_role;
