-- Additive staging-only P0 scaffolding. Apply 0006 first and provision verified
-- identity mappings before using toggle_post_reaction_atomic. No production
-- migration has been performed. Back up and validate on staging first.
-- Rollback: revert API consumers first, then DROP FUNCTION
-- public.toggle_post_reaction_atomic(text,text,text), DROP TABLE
-- public.server_feature_flags, public.user_identity_map; finally ALTER TABLE
-- public.reactions DROP COLUMN reaction_tier_source. Dropping mapping/flag data
-- is destructive and requires a verified backup and authorization.

ALTER TABLE public.reactions ADD COLUMN IF NOT EXISTS reaction_tier_source text NOT NULL
  DEFAULT 'legacy_default' CHECK (reaction_tier_source IN ('legacy_default', 'explicit_choice'));

CREATE TABLE IF NOT EXISTS public.user_identity_map (
  firebase_subject text PRIMARY KEY CHECK (length(firebase_subject) BETWEEN 1 AND 128),
  supabase_uid uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.server_feature_flags (
  name text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.server_feature_flags(name, enabled) VALUES
  ('experimental_tsrg_feed', false), ('tsrg_phase1_data_collection', false),
  ('tsrg_phase2_authority_gating', false), ('tsrg_phase3_bridging_labels', false),
  ('tsrg_phase4_adversarial', false), ('tsrg_phase5_pagerank', false),
  ('tsrg_phase6_dopamine', false), ('tsrg_phase7_goldmine', false),
  ('tsrg_phase8_corpus', false)
ON CONFLICT (name) DO NOTHING;
ALTER TABLE public.user_identity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_feature_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_identity_map, public.server_feature_flags FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_identity_map, public.server_feature_flags TO service_role;

-- Serializes toggles from the same account on the same post. Only the trusted
-- API service may invoke this; it must supply a verified Firebase subject.
CREATE OR REPLACE FUNCTION public.toggle_post_reaction_atomic(p_subject text, p_post_id text, p_reaction_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_uid uuid; v_existing text; v_up bigint; v_down bigint; v_repost bigint;
BEGIN
  IF p_subject IS NULL OR p_post_id IS NULL OR p_reaction_type IS NULL OR p_reaction_type NOT IN ('upvote','downvote','repost') THEN
    RAISE EXCEPTION 'Invalid reaction' USING ERRCODE = '22023';
  END IF;
  SELECT supabase_uid INTO v_uid FROM public.user_identity_map WHERE firebase_subject = p_subject;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Identity mapping required' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_post_id, 0));
  PERFORM 1 FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found' USING ERRCODE = 'P0002'; END IF;
  SELECT reaction_type INTO v_existing FROM public.reactions
    WHERE target_type = 'post' AND target_id = p_post_id AND user_id = v_uid
      AND reaction_type = p_reaction_type LIMIT 1;
  IF p_reaction_type = 'repost' THEN
    DELETE FROM public.reactions WHERE target_type = 'post' AND target_id = p_post_id AND user_id = v_uid AND reaction_type = 'repost';
  ELSE
    DELETE FROM public.reactions WHERE target_type = 'post' AND target_id = p_post_id AND user_id = v_uid AND reaction_type IN ('upvote', 'downvote');
  END IF;
  IF v_existing IS NULL THEN
    INSERT INTO public.reactions(target_type, target_id, user_id, reaction_type)
      VALUES ('post', p_post_id, v_uid, p_reaction_type);
  END IF;
  SELECT count(*) FILTER (WHERE reaction_type = 'upvote'), count(*) FILTER (WHERE reaction_type = 'downvote'),
         count(*) FILTER (WHERE reaction_type = 'repost') INTO v_up, v_down, v_repost
    FROM public.reactions WHERE target_type = 'post' AND target_id = p_post_id;
  RETURN jsonb_build_object('postId', p_post_id, 'reactions', jsonb_build_object('upvote', v_up, 'downvote', v_down, 'repost', v_repost));
END $$;
REVOKE ALL ON FUNCTION public.toggle_post_reaction_atomic(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_post_reaction_atomic(text,text,text) TO service_role;
