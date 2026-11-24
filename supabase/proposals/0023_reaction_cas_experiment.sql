-- SYNTHETIC REVIEW ONLY; NOT A MIGRATION, DEPLOYMENT OR LIVE API.
-- Desired-state voting with compare-and-set for cooperating writers. This is
-- not a truth, tier eligibility, stake, points or penalty system. V2 tier
-- policy remains separate. Existing direct/API/toggle writers bypass this
-- revision entirely; DO NOT DEPLOY before all writers are reconciled and an
-- approved, consistent bootstrap establishes initial state and revisions.
-- A service caller can supply any Firebase subject; this function does not
-- authenticate it or establish ownership. Requires trusted verified identity,
-- safe flags, restricted grants and independent RLS/security review. Receipts
-- are identifiable, need retention, backup and account-deletion policies.
-- Expiry, post deletion/reuse, legacy data, concurrency, scaling, RLS, API,
-- cross-device recovery and complete lifecycle are unverified. No live writes.
CREATE TABLE public.experimental_vote_versions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id text NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
  PRIMARY KEY(user_id,post_id)
);
CREATE TABLE public.experimental_vote_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  post_id text NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  desired text CHECK(desired IN ('upvote','downvote')),
  expected_revision bigint NOT NULL,
  result_revision bigint NOT NULL,
  PRIMARY KEY(user_id,operation_id)
);
ALTER TABLE public.experimental_vote_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experimental_vote_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.experimental_vote_versions,public.experimental_vote_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.experimental_set_vote_cas(p_subject text,p_post_id text,p_desired text,p_expected bigint,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_uid uuid; v_revision bigint; v_previous public.experimental_vote_requests%ROWTYPE;
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
  DELETE FROM public.reactions WHERE target_type='post' AND target_id=p_post_id AND user_id=v_uid AND reaction_type IN ('upvote','downvote');
  IF p_desired IS NOT NULL THEN INSERT INTO public.reactions(target_type,target_id,user_id,reaction_type) VALUES('post',p_post_id,v_uid,p_desired); END IF;
  UPDATE public.experimental_vote_versions SET revision=revision+1 WHERE user_id=v_uid AND post_id=p_post_id RETURNING revision INTO v_revision;
  INSERT INTO public.experimental_vote_requests(user_id,operation_id,post_id,desired,expected_revision,result_revision)
    VALUES(v_uid,p_operation,p_post_id,p_desired,p_expected,v_revision);
  RETURN jsonb_build_object('version',v_revision,'desired',p_desired);
END $$;
REVOKE ALL ON FUNCTION public.experimental_set_vote_cas(text,text,text,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.experimental_set_vote_cas(text,text,text,bigint,uuid) TO service_role;
