-- SYNTHETIC REVIEW ONLY. Not an executable production migration or rollout.
-- Independent V2 experiment; do not apply 0020 and assume a safe upgrade path.
-- Minimal post shape only; full request equivalence, identity, client retries,
-- concurrent deletes, inherited grants, RLS, side effects and live schema are
-- unverified. No API integration. The service-only function accepts a UUID and
-- can impersonate any user; a verified server-side identity bridge is essential.
-- 0019's separate attachment guard is required in this synthetic experiment.
-- A tombstone keeps account/request/post identifiers until account deletion;
-- fingerprints can reveal low-entropy content and are cleared on post deletion.
-- Retention limits, erasure in every sink/backup, recovery, and security review
-- require separate policy and approval. Never purge receipts without analyzing
-- retries; a delayed retry after purge may resurrect a deleted post.
CREATE TABLE public.experimental_post_requests_v2 (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  post_id text NOT NULL UNIQUE,
  fingerprint bytea,
  deleted boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id,request_id),
  CHECK ((deleted AND fingerprint IS NULL) OR (NOT deleted AND fingerprint IS NOT NULL))
);
ALTER TABLE public.experimental_post_requests_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.experimental_post_requests_v2 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.experimental_tombstone_post_request_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE public.experimental_post_requests_v2 SET deleted=true,fingerprint=NULL WHERE post_id=OLD.id;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.experimental_tombstone_post_request_v2() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER experimental_tombstone_post_request_v2 AFTER DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.experimental_tombstone_post_request_v2();

CREATE FUNCTION public.experimental_create_post_once_v2(p_uid uuid,p_request_id uuid,p_post_id text,p_topic_id text,p_content text,p_brain_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_hash bytea; v_existing bytea; v_deleted boolean; v_count integer;
BEGIN
  IF p_uid IS NULL OR p_request_id IS NULL OR p_post_id IS NULL OR p_post_id !~ '^[A-Za-z0-9_-]{1,120}$'
    OR p_topic_id IS NULL OR p_topic_id='' OR length(p_topic_id)>80 OR p_content IS NULL OR length(p_content)<1 OR length(p_content)>10000
    OR (p_brain_id IS NOT NULL AND p_brain_id !~ '^[A-Za-z0-9_-]{1,120}$') THEN
    RAISE EXCEPTION 'Invalid post request' USING ERRCODE='22023';
  END IF;
  v_hash:=sha256(convert_to(jsonb_build_array(p_post_id,p_topic_id,p_content,p_brain_id)::text,'UTF8'));
  INSERT INTO public.experimental_post_requests_v2(user_id,request_id,post_id,fingerprint)
    VALUES(p_uid,p_request_id,p_post_id,v_hash) ON CONFLICT(user_id,request_id) DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count=0 THEN
    SELECT fingerprint,deleted INTO v_existing,v_deleted FROM public.experimental_post_requests_v2
      WHERE user_id=p_uid AND request_id=p_request_id FOR UPDATE;
    IF NOT FOUND OR v_deleted OR v_existing IS DISTINCT FROM v_hash OR NOT EXISTS (SELECT 1 FROM public.posts WHERE id=p_post_id AND user_id=p_uid) THEN
      RAISE EXCEPTION 'Post request conflict' USING ERRCODE='23505';
    END IF;
    RETURN 'replayed';
  END IF;
  INSERT INTO public.posts(id,user_id,topic_id,content,brain_id) VALUES(p_post_id,p_uid,p_topic_id,p_content,p_brain_id);
  RETURN 'created';
END $$;
REVOKE ALL ON FUNCTION public.experimental_create_post_once_v2(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.experimental_create_post_once_v2(uuid,uuid,text,text,text,text) TO service_role;
