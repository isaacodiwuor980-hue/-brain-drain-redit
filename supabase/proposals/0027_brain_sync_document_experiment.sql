-- SYNTHETIC EXPERIMENT ONLY. Do not apply to a shared/live database.
-- Separate storage prototype: does NOT migrate public.brains, provision users,
-- serve public libraries, implement deletion, or protect against privileged
-- callers passing another UUID. Owners and other privileged writers can bypass this protocol.
CREATE TABLE public.brain_sync_documents_experiment (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brain_id text NOT NULL CHECK (length(brain_id) BETWEEN 1 AND 120),
  revision bigint NOT NULL CHECK (revision > 0),
  snapshot jsonb NOT NULL,
  PRIMARY KEY (owner_id, brain_id)
);
CREATE TABLE public.brain_sync_operations_experiment (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  brain_id text NOT NULL,
  expected_revision bigint NOT NULL,
  snapshot jsonb NOT NULL,
  resulting_revision bigint NOT NULL,
  PRIMARY KEY(owner_id, operation_id)
);
ALTER TABLE public.brain_sync_documents_experiment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_sync_operations_experiment ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brain_sync_documents_experiment, public.brain_sync_operations_experiment FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.brain_sync_save_experiment(p_owner uuid, p_brain_id text, p_operation uuid, p_expected bigint, p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previous public.brain_sync_operations_experiment%rowtype; current_rev bigint; next_rev bigint;
BEGIN
  IF p_owner IS NULL OR p_operation IS NULL OR p_expected IS NULL OR p_expected < 0
     OR p_brain_id IS NULL OR p_brain_id !~ '^[A-Za-z0-9_-]{1,120}$'
     OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
     OR p_snapshot->>'id' IS DISTINCT FROM p_brain_id
     OR octet_length(p_snapshot::text) > 1048576 THEN
    RAISE EXCEPTION 'Invalid sync payload' USING ERRCODE='22023';
  END IF;
  -- One operation ID cannot be used concurrently for two different brains.
  -- Lock operation first, then document, consistently for every caller.
  PERFORM pg_advisory_xact_lock(hashtextextended('brain-op:' || p_owner::text || ':' || p_operation::text,0));
  SELECT * INTO previous FROM public.brain_sync_operations_experiment WHERE owner_id=p_owner AND operation_id=p_operation;
  IF FOUND THEN
    IF previous.brain_id IS DISTINCT FROM p_brain_id OR previous.expected_revision IS DISTINCT FROM p_expected OR previous.snapshot IS DISTINCT FROM p_snapshot THEN
      RAISE EXCEPTION 'Operation ID reused' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('revision',previous.resulting_revision,'replayed',true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('brain-doc:' || p_owner::text || ':' || p_brain_id,0));
  SELECT revision INTO current_rev FROM public.brain_sync_documents_experiment WHERE owner_id=p_owner AND brain_id=p_brain_id FOR UPDATE;
  IF NOT FOUND THEN current_rev := 0; END IF;
  IF current_rev <> p_expected THEN
    RAISE EXCEPTION 'Brain version conflict' USING ERRCODE='40001';
  END IF;
  next_rev := current_rev + 1;
  IF current_rev=0 THEN
    INSERT INTO public.brain_sync_documents_experiment(owner_id,brain_id,revision,snapshot) VALUES(p_owner,p_brain_id,next_rev,p_snapshot);
  ELSE
    UPDATE public.brain_sync_documents_experiment SET revision=next_rev,snapshot=p_snapshot WHERE owner_id=p_owner AND brain_id=p_brain_id;
  END IF;
  INSERT INTO public.brain_sync_operations_experiment(owner_id,operation_id,brain_id,expected_revision,snapshot,resulting_revision)
  VALUES (p_owner,p_operation,p_brain_id,p_expected,p_snapshot,next_rev);
  RETURN jsonb_build_object('revision',next_rev,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.brain_sync_save_experiment(uuid,text,uuid,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_sync_save_experiment(uuid,text,uuid,bigint,jsonb) TO service_role;
