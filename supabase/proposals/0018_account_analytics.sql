-- REVIEW / LOCAL TEST ONLY. Do not deploy or apply to a live project.
-- Unwired, separate experimental account-scoped analytics. This does NOT stop,
-- delete, or read legacy /api/events, JSONL files, memory, backups, logs,
-- interests, caches or third-party data. It is not complete opt-out/deletion.
-- UUID and generation MUST come from a trusted authenticated service, never
-- from an untrusted client. Service-only RPC access does not itself prove that
-- ownership, event-time generation, consent or provenance is valid. Review
-- effective roles, owners, privileges, definer functions, RLS and concurrency.

CREATE TABLE public.experimental_analytics_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0)
);
CREATE TABLE public.experimental_account_events (
  user_id uuid NOT NULL REFERENCES public.experimental_analytics_preferences(user_id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('page_view','session_start')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,event_id)
);
ALTER TABLE public.experimental_analytics_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experimental_account_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.experimental_analytics_preferences, public.experimental_account_events FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.experimental_analytics_set(p_uid uuid, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_uid IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'Invalid preference' USING ERRCODE='22023'; END IF;
  INSERT INTO public.experimental_analytics_preferences(user_id) VALUES (p_uid) ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM public.experimental_analytics_preferences WHERE user_id=p_uid FOR UPDATE;
  UPDATE public.experimental_analytics_preferences
    SET generation=generation+CASE WHEN NOT p_enabled OR NOT enabled THEN 1 ELSE 0 END, enabled=p_enabled WHERE user_id=p_uid;
  IF NOT p_enabled THEN DELETE FROM public.experimental_account_events WHERE user_id=p_uid; END IF;
END $$;

CREATE FUNCTION public.experimental_analytics_epoch(p_uid uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_generation bigint;
BEGIN
  IF p_uid IS NULL THEN RAISE EXCEPTION 'Invalid identity' USING ERRCODE='22023'; END IF;
  INSERT INTO public.experimental_analytics_preferences(user_id) VALUES (p_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT generation INTO v_generation FROM public.experimental_analytics_preferences WHERE user_id=p_uid FOR SHARE;
  RETURN v_generation;
END $$;

CREATE FUNCTION public.experimental_analytics_record(p_uid uuid, p_generation bigint, p_event_id uuid, p_kind text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_generation bigint; v_enabled boolean; v_kind text;
BEGIN
  IF p_uid IS NULL OR p_generation IS NULL OR p_generation < 0 OR p_event_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('page_view','session_start') THEN
    RAISE EXCEPTION 'Invalid event' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.experimental_analytics_preferences(user_id) VALUES (p_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT enabled,generation INTO v_enabled,v_generation FROM public.experimental_analytics_preferences WHERE user_id=p_uid FOR UPDATE;
  IF NOT v_enabled OR v_generation <> p_generation THEN RETURN false; END IF;
  SELECT kind INTO v_kind FROM public.experimental_account_events WHERE user_id=p_uid AND event_id=p_event_id;
  IF FOUND THEN
    IF v_kind <> p_kind THEN RAISE EXCEPTION 'Conflicting event' USING ERRCODE='23505'; END IF;
    RETURN true;
  END IF;
  INSERT INTO public.experimental_account_events(user_id,event_id,kind) VALUES (p_uid,p_event_id,p_kind);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.experimental_analytics_set(uuid,boolean), public.experimental_analytics_epoch(uuid), public.experimental_analytics_record(uuid,bigint,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.experimental_analytics_set(uuid,boolean), public.experimental_analytics_epoch(uuid), public.experimental_analytics_record(uuid,bigint,uuid,text) TO service_role;
