-- Staging-only, un-deployed read-only preview of 0008's desired-state setter.
-- Not a preview of the existing toggle route and NOT a concurrency guarantee.
-- Reactions have no tier or updated_at column; never invent a tier or token.
-- Rollback: DROP FUNCTION public.preview_reaction_state(uuid,text,text).
CREATE OR REPLACE FUNCTION public.preview_reaction_state(p_uid uuid, p_post_id text, p_direction text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_desired boolean; v_opposite boolean; v_action text;
BEGIN
  IF p_uid IS NULL OR p_post_id IS NULL OR p_direction IS NULL OR p_direction NOT IN ('upvote','downvote','repost') THEN
    RAISE EXCEPTION 'Invalid reaction' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id = p_post_id) THEN
    RAISE EXCEPTION 'Post not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT coalesce(bool_or(reaction_type = p_direction), false),
         coalesce(bool_or(reaction_type = CASE p_direction WHEN 'upvote' THEN 'downvote' WHEN 'downvote' THEN 'upvote' ELSE NULL END), false)
    INTO v_desired, v_opposite FROM public.reactions
    WHERE target_type = 'post' AND target_id = p_post_id AND user_id = p_uid;
  v_action := CASE WHEN v_desired AND v_opposite THEN 'remove_opposite'
                   WHEN v_desired THEN 'noop'
                   WHEN v_opposite THEN 'flip_direction'
                   ELSE 'insert' END;
  RETURN jsonb_build_object('action', v_action, 'desired_direction', p_direction,
    'current_desired', v_desired, 'current_opposite', v_opposite,
    'concurrency_token', NULL, 'computed_at', now());
END $$;
REVOKE ALL ON FUNCTION public.preview_reaction_state(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_reaction_state(uuid,text,text) TO service_role;
