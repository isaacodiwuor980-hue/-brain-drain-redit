-- REVIEW-ONLY SYNTHETIC EXPERIMENT; NOT A LIVE MIGRATION OR API.
-- The owner chose 30 days. This prototype measures 30 days from SERVER ISSUANCE,
-- not offline creation: unused permits also expire. It assumes a device obtained
-- a permit while online, and lacks permit batching, recovery UI, issuance caps,
-- cleanup, production schema, full post shape, identity/permissions and tests
-- under real concurrent sessions. Legacy client-created IDs are not supported.
-- Never apply to a cloud project without a separately approved complete plan.
-- A UUID argument is NOT proof of ownership: service-role callers can supply
-- any UUID. A verified trusted identity bridge, authorization, issuance limits,
-- rate limiting, deletion, backup, retention and security review are required.
-- Ticket IDs and hashes are account-linked sensitive metadata, not anonymous.
-- UUIDv4 collisions are improbable, not impossible; generators and uniqueness
-- assumptions need independent security review. 0019's guard is required here.
CREATE TABLE public.experimental_post_tickets (
  ticket_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'issued' CHECK (state IN ('issued','created','deleted')),
  fingerprint bytea,
  CHECK ((state='created' AND fingerprint IS NOT NULL) OR (state IN ('issued','deleted') AND fingerprint IS NULL))
);
ALTER TABLE public.experimental_post_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.experimental_post_tickets FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.experimental_issue_post_ticket(p_uid uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid; v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_uid IS NULL THEN RAISE EXCEPTION 'Invalid identity' USING ERRCODE='22023'; END IF;
  INSERT INTO public.experimental_post_tickets(user_id,issued_at,expires_at)
    VALUES(p_uid,v_now,v_now+interval '30 days') RETURNING ticket_id INTO v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION public.experimental_tombstone_ticket() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE public.experimental_post_tickets SET state='deleted',fingerprint=NULL
    WHERE ticket_id::text=OLD.id AND user_id=OLD.user_id AND state='created';
  RETURN OLD;
END $$;
CREATE TRIGGER experimental_tombstone_ticket AFTER DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.experimental_tombstone_ticket();

CREATE FUNCTION public.experimental_create_post_with_ticket(p_uid uuid,p_ticket uuid,p_topic text,p_content text,p_brain text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.experimental_post_tickets%ROWTYPE; h bytea;
BEGIN
  IF p_uid IS NULL OR p_ticket IS NULL OR p_topic IS NULL OR p_topic='' OR length(p_topic)>80 OR p_content IS NULL OR length(p_content)<1 OR length(p_content)>10000 OR (p_brain IS NOT NULL AND p_brain !~ '^[A-Za-z0-9_-]{1,120}$') THEN
    RAISE EXCEPTION 'Invalid post request' USING ERRCODE='22023';
  END IF;
  SELECT * INTO t FROM public.experimental_post_tickets WHERE ticket_id=p_ticket AND user_id=p_uid FOR UPDATE;
  IF NOT FOUND OR t.expires_at<=clock_timestamp() OR t.state='deleted' THEN RAISE EXCEPTION 'Post request unavailable' USING ERRCODE='23505'; END IF;
  h:=sha256(convert_to(jsonb_build_array(p_topic,p_content,p_brain)::text,'UTF8'));
  IF t.state='created' THEN
    IF t.fingerprint IS DISTINCT FROM h OR NOT EXISTS(SELECT 1 FROM public.posts WHERE id=p_ticket::text AND user_id=p_uid) THEN RAISE EXCEPTION 'Post request unavailable' USING ERRCODE='23505'; END IF;
    RETURN 'replayed';
  END IF;
  -- The post ID comes from the issued ticket, never from client input. Thus a
  -- new permit cannot select an expired/deleted post ID; a recovery is a new post.
  INSERT INTO public.posts(id,user_id,topic_id,content,brain_id) VALUES(p_ticket::text,p_uid,p_topic,p_content,p_brain);
  UPDATE public.experimental_post_tickets SET state='created',fingerprint=h WHERE ticket_id=p_ticket;
  RETURN 'created';
END $$;
REVOKE ALL ON FUNCTION public.experimental_tombstone_ticket() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.experimental_issue_post_ticket(uuid),public.experimental_create_post_with_ticket(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.experimental_issue_post_ticket(uuid),public.experimental_create_post_with_ticket(uuid,uuid,text,text,text) TO service_role;
