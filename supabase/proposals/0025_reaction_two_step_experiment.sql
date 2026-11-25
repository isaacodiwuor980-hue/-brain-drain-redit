-- REVIEW-ONLY SYNTHETIC EXPERIMENT. NOT AN APPROVED MIGRATION OR LIVE API.
-- Requires 0023 synthetic tables. Adds a separate function; does NOT replace,
-- disable or change 0023, the legacy API or other direct/privileged writers.
-- Identity proof, trusted new-account provisioning, server-side all-writer
-- enforcement, bootstrap, live grants/RLS, comment/House/Mouth votes, recovery,
-- receipts/retention, lifecycle and concurrency remain unverified. Service
-- caller can impersonate a subject; never deploy or enable without independent
-- security review, exact plan, verified recovery and explicit approval.
CREATE FUNCTION public.experimental_set_vote_two_step(p_subject text,p_post_id text,p_desired text,p_expected bigint,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_uid uuid; v_revision bigint; v_previous public.experimental_vote_requests%ROWTYPE; v_vote_count integer; v_existing text;
BEGIN
  IF p_subject IS NULL OR p_subject !~ '^[A-Za-z0-9_-]{1,128}$' OR p_post_id IS NULL OR p_post_id !~ '^[A-Za-z0-9_-]{1,120}$' OR
     (p_desired IS NOT NULL AND p_desired NOT IN ('upvote','downvote')) OR p_expected IS NULL OR p_expected<0 OR p_operation IS NULL THEN
    RAISE EXCEPTION 'Invalid vote request' USING ERRCODE='22023';
  END IF;
  SELECT supabase_uid INTO v_uid FROM public.user_identity_map WHERE firebase_subject=p_subject FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Identity mapping required' USING ERRCODE='42501'; END IF;
  -- Prevent post deletion while this operation holds its revision lock.
  PERFORM 1 FROM public.posts WHERE id=p_post_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post unavailable' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.experimental_vote_versions(user_id,post_id) VALUES(v_uid,p_post_id) ON CONFLICT DO NOTHING;
  SELECT revision INTO v_revision FROM public.experimental_vote_versions WHERE user_id=v_uid AND post_id=p_post_id FOR UPDATE;
  SELECT * INTO v_previous FROM public.experimental_vote_requests WHERE user_id=v_uid AND operation_id=p_operation;
  IF FOUND THEN
    IF v_previous.post_id IS DISTINCT FROM p_post_id OR v_previous.desired IS DISTINCT FROM p_desired OR v_previous.expected_revision IS DISTINCT FROM p_expected THEN
      RAISE EXCEPTION 'Operation conflict' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('version',v_previous.result_revision,'desired',v_previous.desired);
  END IF;
  IF v_revision<>p_expected THEN RAISE EXCEPTION 'Vote version conflict' USING ERRCODE='40001'; END IF;
  -- Revision locking protects only writers that cooperate with this protocol.
  -- Multiple legacy votes are ambiguous: refuse all new changes, not guess.
  SELECT count(*), min(reaction_type) INTO v_vote_count,v_existing FROM public.reactions
    WHERE target_type='post' AND target_id=p_post_id AND user_id=v_uid AND reaction_type IN ('upvote','downvote');
  IF v_vote_count>1 THEN RAISE EXCEPTION 'Vote needs review' USING ERRCODE='23514'; END IF;
  IF v_vote_count=1 AND p_desired IS NOT NULL AND v_existing<>p_desired THEN
    RAISE EXCEPTION 'Remove vote before switching' USING ERRCODE='23514';
  END IF;
  DELETE FROM public.reactions WHERE target_type='post' AND target_id=p_post_id AND user_id=v_uid AND reaction_type IN ('upvote','downvote');
  IF p_desired IS NOT NULL THEN INSERT INTO public.reactions(target_type,target_id,user_id,reaction_type) VALUES('post',p_post_id,v_uid,p_desired); END IF;
  UPDATE public.experimental_vote_versions SET revision=revision+1 WHERE user_id=v_uid AND post_id=p_post_id RETURNING revision INTO v_revision;
  INSERT INTO public.experimental_vote_requests(user_id,operation_id,post_id,desired,expected_revision,result_revision)
    VALUES(v_uid,p_operation,p_post_id,p_desired,p_expected,v_revision);
  RETURN jsonb_build_object('version',v_revision,'desired',p_desired);
END $$;
REVOKE ALL ON FUNCTION public.experimental_set_vote_two_step(text,text,text,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.experimental_set_vote_two_step(text,text,text,bigint,uuid) TO service_role;
