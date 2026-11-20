-- Additive staging-only RPC. 0007's toggle RPC remains unchanged because it
-- has different semantics. This is a desired-state setter, NOT a safe shadow
-- writer: a delayed call can overwrite a newer user action. No deployment has
-- been performed. Rollback after removing consumers: DROP FUNCTION
-- public.set_post_reaction_atomic(text,text,text); no rows are reverted.
CREATE OR REPLACE FUNCTION public.set_post_reaction_atomic(p_subject text, p_post_id text, p_reaction_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_uid uuid;
BEGIN
  IF p_subject IS NULL OR p_post_id IS NULL OR p_reaction_type IS NULL
     OR p_reaction_type NOT IN ('upvote', 'downvote', 'repost') THEN
    RAISE EXCEPTION 'Invalid reaction' USING ERRCODE = '22023';
  END IF;
  SELECT supabase_uid INTO v_uid FROM public.user_identity_map WHERE firebase_subject = p_subject;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Identity mapping required' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_post_id, 0));
  PERFORM 1 FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found' USING ERRCODE = 'P0002'; END IF;
  -- Reposts are independent of the mutually exclusive up/down vote.
  IF p_reaction_type IN ('upvote', 'downvote') THEN
    IF EXISTS (SELECT 1 FROM public.reactions WHERE target_type = 'post' AND target_id = p_post_id
               AND user_id = v_uid AND reaction_type = p_reaction_type) THEN
      -- Repair a legacy dual-vote row if one exists, preserving the desired row.
      DELETE FROM public.reactions WHERE target_type = 'post' AND target_id = p_post_id
        AND user_id = v_uid AND reaction_type = CASE p_reaction_type WHEN 'upvote' THEN 'downvote' ELSE 'upvote' END;
    ELSE
      UPDATE public.reactions SET reaction_type = p_reaction_type
        WHERE target_type = 'post' AND target_id = p_post_id AND user_id = v_uid
          AND reaction_type = CASE p_reaction_type WHEN 'upvote' THEN 'downvote' ELSE 'upvote' END;
      IF NOT FOUND THEN
        INSERT INTO public.reactions(target_type, target_id, user_id, reaction_type)
          VALUES ('post', p_post_id, v_uid, p_reaction_type)
          ON CONFLICT (target_type, target_id, user_id, reaction_type) DO NOTHING;
      END IF;
    END IF;
  ELSE
    INSERT INTO public.reactions(target_type, target_id, user_id, reaction_type)
      VALUES ('post', p_post_id, v_uid, p_reaction_type)
      ON CONFLICT (target_type, target_id, user_id, reaction_type) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('postId', p_post_id, 'reactionType', p_reaction_type);
END $$;
REVOKE ALL ON FUNCTION public.set_post_reaction_atomic(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_post_reaction_atomic(text,text,text) TO service_role;
