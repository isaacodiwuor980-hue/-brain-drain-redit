-- LOCAL REVIEW ONLY. Requires proposal 0013; do not apply to Supabase.
-- Force the API service through the locking, epoch-checking RPCs for mutations.
-- This removes the explicitly granted DML privileges only; audit ownership,
-- inherited memberships, column grants, and all other database roles before use.
-- Retained SELECT supports the current proposed preferences API; privileged
-- readers and the service-only RPCs still require trusted ownership checks.
-- This is not a complete opt-out, data deletion, or security boundary against
-- a compromised service role or a table owner.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.feed_personalization_preferences, public.feed_interest_topics FROM service_role;
