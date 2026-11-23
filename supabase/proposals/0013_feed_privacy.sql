-- LOCAL TESTING / REVIEW ONLY. Do not apply to Supabase. This proposal is not
-- integrated with the feed, identity provisioning, tracking or UI. A local-only
-- API can call these functions but is not live or browser-integrated. Service
-- callers must authenticate and resolve the user's UUID before invoking it.
-- OFF by default; opt-out removes only the proposed interest-topic rows, not
-- analytics events, caches, backups or other derived copies. A complete privacy
-- lifecycle, trusted event-time epoch capture and real multi-session tests are required.
CREATE TABLE public.feed_personalization_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  interest_epoch bigint NOT NULL DEFAULT 0 CHECK (interest_epoch >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.feed_interest_topics (
  user_id uuid NOT NULL REFERENCES public.feed_personalization_preferences(user_id) ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES public.topics(id),
  score numeric(5,4) NOT NULL CHECK (score >= 0 AND score <= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic_id)
);
ALTER TABLE public.feed_personalization_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_interest_topics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_personalization_preferences, public.feed_interest_topics FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_personalization_preferences, public.feed_interest_topics TO service_role;

-- The preference row serializes cooperating readers/writers with disable/clear.
-- Existing analytics and other clients do not use this lock.
CREATE FUNCTION public.feed_set_personalization(p_uid uuid, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_flag boolean;
BEGIN
  IF p_uid IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'Invalid preference' USING ERRCODE = '22023'; END IF;
  -- Serialize enabling with an update/delete of the same feature-flag row.
  -- Disable must not depend on the flag so privacy requests still work.
  IF p_enabled THEN
    SELECT enabled INTO v_flag FROM public.server_feature_flags
      WHERE name='feed_interest_tracking_v2' FOR SHARE;
    IF NOT FOUND OR v_flag IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Feature unavailable' USING ERRCODE = '42501';
    END IF;
  END IF;
  INSERT INTO public.feed_personalization_preferences(user_id) VALUES (p_uid) ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM public.feed_personalization_preferences WHERE user_id = p_uid FOR UPDATE;
  UPDATE public.feed_personalization_preferences SET interest_epoch = interest_epoch + CASE WHEN NOT p_enabled OR NOT enabled THEN 1 ELSE 0 END, enabled=p_enabled, updated_at=now() WHERE user_id=p_uid;
  IF NOT p_enabled THEN DELETE FROM public.feed_interest_topics WHERE user_id=p_uid; END IF;
END $$;

CREATE FUNCTION public.feed_clear_interests(p_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_uid IS NULL THEN RAISE EXCEPTION 'Invalid identity' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.feed_personalization_preferences(user_id) VALUES (p_uid) ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM public.feed_personalization_preferences WHERE user_id=p_uid FOR UPDATE;
  UPDATE public.feed_personalization_preferences SET interest_epoch=interest_epoch+1, updated_at=now() WHERE user_id=p_uid;
  DELETE FROM public.feed_interest_topics WHERE user_id=p_uid;
END $$;

-- Epoch must be captured at event collection time by a trusted, authenticated
-- producer. Looking it up when consuming an old queued event defeats this guard.
CREATE FUNCTION public.feed_interest_epoch(p_uid uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_epoch bigint;
BEGIN
  IF p_uid IS NULL THEN RAISE EXCEPTION 'Invalid identity' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.feed_personalization_preferences(user_id) VALUES (p_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT interest_epoch INTO v_epoch FROM public.feed_personalization_preferences WHERE user_id=p_uid FOR SHARE;
  RETURN v_epoch;
END $$;

CREATE FUNCTION public.feed_record_interest(p_uid uuid, p_topic text, p_score numeric, p_epoch bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_enabled boolean; v_epoch bigint; v_flag boolean;
BEGIN
  IF p_epoch IS NULL OR p_epoch < 0 OR p_uid IS NULL OR p_topic IS NULL OR p_topic = '' OR p_score IS NULL OR p_score::text IN ('NaN','Infinity','-Infinity') OR p_score < 0 OR p_score > 1 THEN
    RAISE EXCEPTION 'Invalid interest' USING ERRCODE = '22023';
  END IF;
  SELECT enabled INTO v_flag FROM public.server_feature_flags WHERE name='feed_interest_tracking_v2' FOR SHARE;
  IF NOT FOUND OR v_flag IS DISTINCT FROM true THEN RETURN false; END IF;
  INSERT INTO public.feed_personalization_preferences(user_id) VALUES (p_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT enabled, interest_epoch INTO v_enabled, v_epoch FROM public.feed_personalization_preferences WHERE user_id=p_uid FOR UPDATE;
  IF NOT v_enabled OR p_epoch <> v_epoch THEN RETURN false; END IF;
  INSERT INTO public.feed_interest_topics(user_id,topic_id,score) VALUES (p_uid,p_topic,p_score)
    ON CONFLICT (user_id,topic_id) DO UPDATE SET score=EXCLUDED.score, updated_at=now();
  RETURN true;
END $$;

CREATE FUNCTION public.feed_read_interests(p_uid uuid)
RETURNS TABLE(topic_id text, score numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_enabled boolean; v_flag boolean;
BEGIN
  IF p_uid IS NULL THEN RAISE EXCEPTION 'Invalid identity' USING ERRCODE = '22023'; END IF;
  SELECT enabled INTO v_flag FROM public.server_feature_flags WHERE name='feed_interest_tracking_v2' FOR SHARE;
  IF NOT FOUND OR v_flag IS DISTINCT FROM true THEN RETURN; END IF;
  SELECT enabled INTO v_enabled FROM public.feed_personalization_preferences WHERE user_id=p_uid FOR SHARE;
  IF NOT FOUND OR NOT v_enabled THEN RETURN; END IF;
  RETURN QUERY SELECT t.topic_id,t.score FROM public.feed_interest_topics t WHERE t.user_id=p_uid;
END $$;
REVOKE ALL ON FUNCTION public.feed_set_personalization(uuid,boolean), public.feed_clear_interests(uuid), public.feed_record_interest(uuid,text,numeric,bigint), public.feed_interest_epoch(uuid), public.feed_read_interests(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feed_set_personalization(uuid,boolean), public.feed_clear_interests(uuid), public.feed_record_interest(uuid,text,numeric,bigint), public.feed_interest_epoch(uuid), public.feed_read_interests(uuid) TO service_role;
