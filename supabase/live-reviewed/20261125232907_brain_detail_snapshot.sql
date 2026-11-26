-- One statement snapshot of a public brain or a verified mapped owner's brain.
-- The caller must supply only a verified UUID; service_role bypasses RLS.
-- This function is not a general authorization boundary for privileged clients.
DO $$ BEGIN
  IF to_regprocedure('public.read_brain_detail_v2(text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Brain detail function already exists; migration stopped';
  END IF;
END $$;
CREATE FUNCTION public.read_brain_detail_v2(p_id text, p_uid uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object(
    'brain', jsonb_build_object('id', b.id, 'author_id', b.author_id, 'title', b.title,
      'category', b.category, 'description', b.description, 'root_node_id', b.root_node_id,
      'is_public', b.is_public, 'is_favorite', b.is_favorite, 'repo_status', b.repo_status,
      'active_branch', b.active_branch, 'created_at', b.created_at),
    'nodes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', n.id, 'brain_id', n.brain_id, 'node_type', n.node_type,
      'question_text', n.question_text, 'result_text', n.result_text, 'next_steps', n.next_steps,
      'if_true_node_id', n.if_true_node_id, 'if_false_node_id', n.if_false_node_id,
      'attachments', n.attachments) ORDER BY n.id)
      FROM public.brain_nodes n WHERE n.brain_id=b.id), '[]'::jsonb)
  ) FROM public.brains b
  WHERE b.id = p_id AND (b.is_public IS TRUE OR (p_uid IS NOT NULL AND b.author_id = p_uid));
$$;
REVOKE ALL ON FUNCTION public.read_brain_detail_v2(text,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_brain_detail_v2(text,uuid) TO service_role;
DO $$ BEGIN
  IF has_function_privilege('anon','public.read_brain_detail_v2(text,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.read_brain_detail_v2(text,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.read_brain_detail_v2(text,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Unexpected inherited brain-detail privileges'; END IF;
END $$;
