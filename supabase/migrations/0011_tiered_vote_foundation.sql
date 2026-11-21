-- REVIEW/STAGING ONLY. Additive, service-only foundation for explicit tiered
-- votes. Depends on reviewed 0001/0007 schema and trusted identity mapping.
-- It does not create authority grants, infer expertise, replace ordinary
-- reactions, enable a UI or implement abuse detection/penalties.
-- Rollback: stop all consumers first. Dropping these tables destroys votes and
-- authority records; use only with approval and a verified backup/restore plan.

CREATE TABLE IF NOT EXISTS public.topic_authority_grants (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES public.topics(id),
  authority_score numeric(5,4) NOT NULL CHECK (authority_score > 0 AND authority_score <= 1),
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  evidence_reference text NOT NULL CHECK (char_length(evidence_reference) BETWEEN 1 AND 200),
  verified_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (user_id, topic_id)
);

CREATE TABLE IF NOT EXISTS public.tiered_post_votes (
  post_id text NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('upvote', 'downvote')),
  tier text NOT NULL CHECK (tier IN ('mouth', 'lunch', 'house', 'life')),
  authority_score_snapshot numeric(5,4) NOT NULL CHECK (authority_score_snapshot > 0 AND authority_score_snapshot <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS tiered_post_votes_post_idx ON public.tiered_post_votes(post_id);
ALTER TABLE public.topic_authority_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiered_post_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.topic_authority_grants, public.tiered_post_votes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_authority_grants, public.tiered_post_votes TO service_role;

-- The caller is responsible for authenticating the subject and authorizing
-- the service operation. The database resolves the mapping and post topic;
-- it never trusts a client-supplied authority score or topic. NULL/NULL
-- removes the caller's vote, including after a grant is revoked. This setter
-- does not provide cross-request version ordering or replay protection.
CREATE OR REPLACE FUNCTION public.set_tiered_post_vote(
  p_subject text, p_post_id text, p_direction text, p_tier text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_uid uuid; v_topic text; v_score numeric;
BEGIN
  IF p_subject IS NULL OR p_subject = '' OR p_post_id IS NULL OR p_post_id = '' OR
     (p_direction IS NULL AND p_tier IS NOT NULL) OR
     (p_direction IS NOT NULL AND (p_direction NOT IN ('upvote', 'downvote') OR
       p_tier IS NULL OR p_tier NOT IN ('mouth', 'lunch', 'house', 'life'))) THEN
    RAISE EXCEPTION 'Invalid tiered vote' USING ERRCODE = '22023';
  END IF;
  SELECT supabase_uid INTO v_uid FROM public.user_identity_map WHERE firebase_subject = p_subject;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Identity mapping required' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_post_id, 0));
  -- Hold the post stable while checking its current topic and saving the vote.
  SELECT topic_id INTO v_topic FROM public.posts WHERE id = p_post_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found' USING ERRCODE = 'P0002'; END IF;
  IF p_direction IS NULL THEN
    DELETE FROM public.tiered_post_votes WHERE post_id = p_post_id AND user_id = v_uid;
    RETURN jsonb_build_object('postId', p_post_id, 'direction', NULL, 'tier', NULL);
  END IF;
  -- FOR SHARE serializes against concurrent grant updates/revocations.
  SELECT authority_score INTO v_score FROM public.topic_authority_grants
    WHERE user_id = v_uid AND topic_id = v_topic AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Topic authority required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.tiered_post_votes(post_id, user_id, direction, tier, authority_score_snapshot)
    VALUES(p_post_id, v_uid, p_direction, p_tier, v_score)
    ON CONFLICT(post_id, user_id) DO UPDATE
      SET direction = EXCLUDED.direction, tier = EXCLUDED.tier,
          authority_score_snapshot = EXCLUDED.authority_score_snapshot, updated_at = now();
  RETURN jsonb_build_object('postId', p_post_id, 'direction', p_direction, 'tier', p_tier);
END $$;
REVOKE ALL ON FUNCTION public.set_tiered_post_vote(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_tiered_post_vote(text,text,text,text) TO service_role;
