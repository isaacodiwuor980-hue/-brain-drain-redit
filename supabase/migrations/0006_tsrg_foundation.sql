-- TSRG v2 additive, service-only foundation. No jobs, triggers, backfills of
-- velocity, reputation, clusters or labels. Do not apply until identity mapping,
-- privacy, migrations and rollout are approved and tested on staging.
-- Existing reactions obtain the compatibility default 'mouth'; this does NOT
-- imply that a user made a confidence stake. Do not treat legacy votes as stakes.
-- Rollback (after stopping any future consumers; BACK UP the affected data):
-- DROP TABLE IF EXISTS public.tsrg_jobs, public.daily_stake_budget,
-- public.user_cohort_fingerprint, public.post_accuracy_label,
-- public.post_flag_state, public.ring_identity, public.covote_edge,
-- public.post_velocity_hourly, public.user_cluster, public.user_tag_authority;
-- ALTER TABLE public.reactions DROP COLUMN IF EXISTS tier;
-- Dropping these objects destroys collected data; do not run without approval.

ALTER TABLE public.reactions ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'mouth'
  CHECK (tier IN ('mouth', 'lunch', 'house', 'life'));
CREATE TABLE IF NOT EXISTS public.user_tag_authority (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag text NOT NULL, affinity_score numeric(8,4) NOT NULL DEFAULT 0,
  affinity_norm numeric(5,4) NOT NULL DEFAULT 0 CHECK (affinity_norm BETWEEN 0 AND 1),
  z_score numeric(5,4) NOT NULL DEFAULT 0 CHECK (z_score BETWEEN 0 AND 1),
  self_declared boolean NOT NULL DEFAULT false,
  authority numeric(5,4) NOT NULL DEFAULT 0 CHECK (authority BETWEEN 0 AND 1),
  authority_tier smallint NOT NULL DEFAULT 0 CHECK (authority_tier BETWEEN 0 AND 4),
  evidence_count integer NOT NULL DEFAULT 0, bridging_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_uta_tag_auth ON public.user_tag_authority(tag, authority DESC);
CREATE TABLE IF NOT EXISTS public.user_cluster (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cluster_id text NOT NULL, assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_uc_cluster ON public.user_cluster(cluster_id);
CREATE TABLE IF NOT EXISTS public.post_velocity_hourly (
  post_id text NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  hour_bucket timestamptz NOT NULL, up_mass bigint NOT NULL DEFAULT 0,
  down_mass bigint NOT NULL DEFAULT 0, stake_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, hour_bucket)
);
CREATE INDEX IF NOT EXISTS idx_pvh_bucket ON public.post_velocity_hourly(hour_bucket DESC);
CREATE TABLE IF NOT EXISTS public.covote_edge (
  u1 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  u2 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight integer NOT NULL DEFAULT 1 CHECK (weight > 0), last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (u1, u2), CHECK (u1 < u2)
);
CREATE INDEX IF NOT EXISTS idx_covote_u1 ON public.covote_edge(u1);
CREATE INDEX IF NOT EXISTS idx_covote_u2 ON public.covote_edge(u2);
CREATE TABLE IF NOT EXISTS public.ring_identity (
  hash text PRIMARY KEY, members text[] NOT NULL, flagged_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.post_flag_state (
  post_id text PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  brigade_damping numeric(3,2) NOT NULL DEFAULT 1 CHECK (brigade_damping BETWEEN 0 AND 1),
  brigade_until timestamptz, ring_damping numeric(3,2) NOT NULL DEFAULT 1 CHECK (ring_damping BETWEEN 0 AND 1),
  ring_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.post_accuracy_label (
  post_id text PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  truth_score numeric(10,6) NOT NULL,
  accuracy_label text NOT NULL CHECK (accuracy_label IN ('unverified', 'contested', 'community_validated', 'cross_cluster_validated', 'high_confidence')),
  bridging_clusters integer NOT NULL DEFAULT 0, effective_stake_mass bigint NOT NULL,
  label_computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pal_label ON public.post_accuracy_label(accuracy_label, truth_score DESC);
CREATE TABLE IF NOT EXISTS public.user_cohort_fingerprint (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint text NOT NULL, first_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ucf_fp ON public.user_cohort_fingerprint(fingerprint);
CREATE TABLE IF NOT EXISTS public.daily_stake_budget (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, tag text NOT NULL,
  day date NOT NULL, used_mass bigint NOT NULL DEFAULT 0 CHECK (used_mass >= 0),
  PRIMARY KEY (user_id, tag, day)
);
CREATE TABLE IF NOT EXISTS public.tsrg_jobs (
  name text PRIMARY KEY, last_run_at timestamptz, next_run_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz, locked_by text, payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- No anonymous or authenticated direct table access. Service role must also
-- enforce per-operation authorization; RLS does not restrict its bypass role.
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['user_tag_authority','user_cluster','post_velocity_hourly','covote_edge','ring_identity','post_flag_state','post_accuracy_label','user_cohort_fingerprint','daily_stake_budget','tsrg_jobs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', tbl);
  END LOOP;
END $$;
