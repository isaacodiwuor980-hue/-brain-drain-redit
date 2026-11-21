-- Atomic, service-role-only brain save. Deploy this migration BEFORE the API
-- code that calls it. Rollback: revert the API code first, then DROP FUNCTION
-- public.save_brain_atomic(uuid, jsonb, jsonb). No existing rows are modified
-- by this migration. Test against the deployed schema and back up before use.
-- Firebase subjects must already map to auth.users UUIDs; this function does
-- not solve identity provisioning.
create or replace function public.save_brain_atomic(
  p_uid uuid,
  p_brain jsonb,
  p_nodes jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  saved public.brains%rowtype;
  was_created boolean := false;
  written integer;
  expected integer;
begin
  if p_uid is null or jsonb_typeof(p_brain) is distinct from 'object'
     or jsonb_typeof(p_nodes) is distinct from 'array' then
    raise exception 'Invalid brain payload' using errcode = '22023';
  end if;
  expected := jsonb_array_length(p_nodes);
  if expected > 500 or exists (
    select 1 from jsonb_array_elements(p_nodes) n
    where n->>'brain_id' is distinct from p_brain->>'id'
       or n->>'id' is null or n->>'id' = ''
  ) or (select count(distinct n->>'id') from jsonb_array_elements(p_nodes) n) <> expected then
    raise exception 'Invalid brain nodes' using errcode = '22023';
  end if;
  -- Only references within the submitted snapshot are accepted. Otherwise a
  -- service-role insert could link to someone else's globally keyed node.
  if (p_brain->>'root_node_id' is not null and not exists (
        select 1 from jsonb_array_elements(p_nodes) n where n->>'id' = p_brain->>'root_node_id'
      )) or exists (
        select 1 from jsonb_array_elements(p_nodes) n
        cross join lateral (values (n->>'if_true_node_id'), (n->>'if_false_node_id')) ref(id)
        where ref.id is not null and not exists (
          select 1 from jsonb_array_elements(p_nodes) target where target->>'id' = ref.id
        )
      ) then
    raise exception 'Node references must stay within this brain' using errcode = '22023';
  end if;

  insert into public.brains (id, author_id, title, category, description, root_node_id, is_public, is_favorite, repo_status, active_branch)
  values (p_brain->>'id', p_uid, p_brain->>'title', coalesce(p_brain->>'category', ''),
    coalesce(p_brain->>'description', ''), p_brain->>'root_node_id',
    coalesce((p_brain->>'is_public')::boolean, false), coalesce((p_brain->>'is_favorite')::boolean, false),
    p_brain->>'repo_status', p_brain->>'active_branch')
  on conflict (id) do nothing returning * into saved;
  if found then
    was_created := true;
  else
    -- The UPDATE obtains a row lock. A concurrent creator cannot be silently
    -- replaced: the ownership predicate is checked after the conflict resolves.
    update public.brains set title = p_brain->>'title', category = coalesce(p_brain->>'category', ''),
      description = coalesce(p_brain->>'description', ''), root_node_id = p_brain->>'root_node_id',
      is_public = coalesce((p_brain->>'is_public')::boolean, false),
      is_favorite = coalesce((p_brain->>'is_favorite')::boolean, false),
      repo_status = p_brain->>'repo_status', active_branch = p_brain->>'active_branch', updated_at = now()
    where id = p_brain->>'id' and author_id = p_uid returning * into saved;
    if not found then
      raise exception 'Brain ownership conflict' using errcode = '42501';
    end if;
  end if;

  insert into public.brain_nodes (id, brain_id, node_type, question_text, result_text, next_steps, if_true_node_id, if_false_node_id, attachments)
  select n.id, saved.id, n.node_type, n.question_text, n.result_text, n.next_steps,
    n.if_true_node_id, n.if_false_node_id, coalesce(n.attachments, '[]'::jsonb)
  from jsonb_to_recordset(p_nodes) as n(id text, brain_id text, node_type text, question_text text,
    result_text text, next_steps text, if_true_node_id text, if_false_node_id text, attachments jsonb)
  on conflict (id) do update set node_type = excluded.node_type, question_text = excluded.question_text,
    result_text = excluded.result_text, next_steps = excluded.next_steps,
    if_true_node_id = excluded.if_true_node_id, if_false_node_id = excluded.if_false_node_id,
    attachments = excluded.attachments
  where public.brain_nodes.brain_id = excluded.brain_id;
  get diagnostics written = row_count;
  if written <> expected then
    raise exception 'Node ownership conflict' using errcode = '42501';
  end if;
  delete from public.brain_nodes bn where bn.brain_id = saved.id
    and not exists (select 1 from jsonb_array_elements(p_nodes) n where n->>'id' = bn.id);
  return jsonb_build_object('brain', to_jsonb(saved), 'created', was_created, 'nodeCount', expected);
end;
$$;
revoke all on function public.save_brain_atomic(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_brain_atomic(uuid, jsonb, jsonb) to service_role;
