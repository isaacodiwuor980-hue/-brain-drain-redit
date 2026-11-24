-- SYNTHETIC REVIEW ONLY: NOT A MIGRATION, NOT WIRED, DO NOT APPLY LIVE.
-- Minimal post shape only; real posts also have tags, type, event, media and
-- timestamps. Schema, payload canonicalization, all writers, retention, API,
-- authorization, production concurrency and deletion semantics are unverified.
-- A caller-supplied UUID is NOT identity proof. The server would have to verify
-- Firebase and resolve an independently trusted mapping before invoking this.
-- service_role can call with any UUID: a compromised caller can impersonate.
-- SHA-256 fingerprints are not anonymous; low-entropy content can be guessed.
-- Receipts and backups require access, retention and account-erasure policies.
-- Cascading post deletion removes receipts: delayed retries can recreate deleted
-- posts. This experiment MUST NOT ship until tombstones/retry expiry and recovery
-- semantics have been designed, reviewed and tested. Requires separate approval.

CREATE TABLE public.experimental_post_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  post_id text NOT NULL UNIQUE REFERENCES public.posts(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  fingerprint bytea NOT NULL,
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE public.experimental_post_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.experimental_post_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.experimental_create_post_once(p_uid uuid,p_request_id uuid,p_post_id text,p_topic_id text,p_content text,p_brain_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_hash bytea; v_existing bytea; v_count integer;
BEGIN
  IF p_uid IS NULL OR p_request_id IS NULL OR p_post_id IS NULL OR p_post_id !~ '^[A-Za-z0-9_-]{1,120}$'
    OR p_topic_id IS NULL OR p_topic_id = '' OR length(p_topic_id)>80 OR p_content IS NULL OR length(p_content)<1 OR length(p_content)>10000
    OR (p_brain_id IS NOT NULL AND p_brain_id !~ '^[A-Za-z0-9_-]{1,120}$') THEN
    RAISE EXCEPTION 'Invalid post request' USING ERRCODE='22023';
  END IF;
  v_hash := sha256(convert_to(jsonb_build_array(p_post_id,p_topic_id,p_content,p_brain_id)::text,'UTF8'));
  INSERT INTO public.experimental_post_requests(user_id,request_id,post_id,fingerprint)
    VALUES (p_uid,p_request_id,p_post_id,v_hash)
    ON CONFLICT (user_id,request_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count=0 THEN
    SELECT fingerprint INTO v_existing FROM public.experimental_post_requests
      WHERE user_id=p_uid AND request_id=p_request_id FOR UPDATE;
    IF NOT FOUND OR v_existing IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'Post request conflict' USING ERRCODE='23505';
    END IF;
    RETURN 'replayed';
  END IF;
  -- The separately reviewed 0019 trigger is required for this experiment's
  -- public-brain checks; this function does not itself provide authorization.
  INSERT INTO public.posts(id,user_id,topic_id,content,brain_id)
    VALUES (p_post_id,p_uid,p_topic_id,p_content,p_brain_id);
  RETURN 'created';
END $$;
REVOKE ALL ON FUNCTION public.experimental_create_post_once(uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.experimental_create_post_once(uuid,uuid,text,text,text,text) TO service_role;
