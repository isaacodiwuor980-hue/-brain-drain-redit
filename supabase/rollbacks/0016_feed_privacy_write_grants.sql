-- REVIEW ONLY. This restores broad write grants and can allow a service client
-- to bypass interest opt-out and epoch checks. Do not run without explicit
-- approval and a replacement protection. This does not restore lost data.
GRANT INSERT, UPDATE, DELETE ON public.feed_personalization_preferences, public.feed_interest_topics TO service_role;
