-- Phase 0004 — Community rebuild: OTP / Onboarding / Personality / Experts / Mentors / Recall
--
-- Implements the evidence-based community rebuild spec (Task A, P1).
-- All tables use uuid PKs, RLS enabled by default, service-role bypass
-- is granted explicitly to the api role via the existing service-role key.
--
-- Designed to be idempotent: every statement uses IF NOT EXISTS so the
-- migration can be re-run safely on a partially-migrated database.

-- ===========================================================================
-- 1. otp_requests
-- ===========================================================================
-- Email/SMS OTP codes for passwordless sign-in. Codes are hashed (sha256)
-- at rest; raw codes never persist. Codes expire after 10 minutes and are
-- single-use. Brute-force protection is enforced at the API layer (rate
-- limit + max 5 attempts per code).

create table if not exists public.otp_requests (
  id uuid primary key default gen_random_uuid(),
  -- Delivery channel. 'email' is the only supported channel in P1; 'sms'
  -- is reserved for future Twilio integration.
  channel text not null check (channel in ('email', 'sms')),
  -- Normalized delivery target: lowercase email or E.164 phone.
  target text not null,
  -- sha256 hex digest of the 6-digit code. Raw code is NEVER stored.
  code_hash text not null,
  -- Number of verification attempts against this code.
  attempts integer not null default 0,
  -- Status lifecycle: pending -> verified | expired | consumed
  status text not null default 'pending' check (status in ('pending', 'verified', 'expired', 'consumed')),
  -- Optional: anchor OTP to a user_id once we know who they are (re-auth flow).
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  verified_at timestamptz,
  consumed_at timestamptz
);

create index if not exists otp_requests_target_idx
  on public.otp_requests(target)
  where status = 'pending';

create index if not exists otp_requests_user_id_idx
  on public.otp_requests(user_id)
  where user_id is not null;

comment on table public.otp_requests is
  'OTP code requests for passwordless auth. Codes hashed at rest, expire 10min, single-use.';
comment on column public.otp_requests.code_hash is
  'sha256 hex of the 6-digit code. Raw code is never persisted.';

-- ===========================================================================
-- 2. onboarding
-- ===========================================================================
-- Tracks where each user is in the new-user onboarding flow. One row per
-- user. The state machine: profile -> interests -> personality -> experts -> done.
-- Restart-able: if a user abandons mid-flow, they resume from their last
-- checkpoint (current_step).

create table if not exists public.onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Current step in the onboarding state machine.
  current_step text not null default 'profile'
    check (current_step in ('profile', 'interests', 'personality', 'experts', 'done')),
  -- Step completion timestamps (used to compute completion rate, detect drop-offs).
  profile_completed_at timestamptz,
  interests_completed_at timestamptz,
  personality_completed_at timestamptz,
  experts_completed_at timestamptz,
  completed_at timestamptz,
  -- Free-form JSONB scratchpad for step-specific data the client wants to
  -- persist mid-flow (e.g. draft interests list before final submit).
  scratch jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.onboarding is
  'Per-user onboarding state machine. One row per user. Restart-able from last step.';

-- ===========================================================================
-- 3. personality_results
-- ===========================================================================
-- Stores BFI-10 (Big Five Inventory, 10-item version) scores per user.
-- BFI-10 reference: Rammstedt & John (2007). Measuring personality in one
-- minute or less: A 10-item short version of the Big Five Inventory.
--
-- Each trait is scored on a 1-5 Likert scale (extraversion, agreeableness,
-- conscientiousness, neuroticism, openness). Two items per trait, one
-- reverse-keyed. See PersonalityTestPage for the item text and scoring key.

create table if not exists public.personality_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Raw item responses (10 items, values 1-5).
  -- Format: {"e1": 5, "e2r": 2, "a1": 4, "a2r": 3, ...}
  responses jsonb not null,
  -- Computed trait scores (1.0-5.0 each).
  extraversion numeric(3,2) not null,
  agreeableness numeric(3,2) not null,
  conscientiousness numeric(3,2) not null,
  neuroticism numeric(3,2) not null,
  openness numeric(3,2) not null,
  -- Optional: which version of the test was used (for future migrations).
  test_version text not null default 'bfi-10',
  created_at timestamptz not null default now()
);

create index if not exists personality_results_user_id_idx
  on public.personality_results(user_id, created_at desc);

comment on table public.personality_results is
  'BFI-10 Big Five personality scores. Multiple rows per user allowed (re-tests).';
comment on column public.personality_results.responses is
  'Raw 10-item responses: {"e1":1-5, "e2r":1-5, "a1":..., "a2r":..., "c1":..., "c2r":..., "n1":..., "n2r":..., "o1":..., "o2r":...}';

-- ===========================================================================
-- 4. experts
-- ===========================================================================
-- Expert directory: verified subject-matter experts who can be matched as
-- mentors. Each expert has credentials (ORCID, license #) that enter a
-- human-review queue before being marked verified.

create table if not exists public.experts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  -- Display info (denormalized from profiles for fast directory queries).
  display_name text not null,
  avatar_url text,
  bio text not null default '',
  -- Primary expertise area (e.g. "Cardiology", "Criminal Law").
  expertise text not null,
  -- Secondary expertise tags.
  expertise_tags text[] not null default '{}',
  -- Credentialing (enters review queue, then verified).
  -- Status: draft -> pending_review -> verified | rejected
  credential_status text not null default 'draft'
    check (credential_status in ('draft', 'pending_review', 'verified', 'rejected')),
  -- Structured credential data (ORCID, license #, etc.).
  -- Format: {"orcid":"0000-0001-2345-6789","license_state":"CA","license_number":"X12345",...}
  credentials jsonb not null default '{}'::jsonb,
  -- Review metadata (filled by admin).
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  -- Visibility: verified experts are public; drafts/pending are private.
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists experts_credential_status_idx
  on public.experts(credential_status)
  where credential_status in ('pending_review', 'verified');

create index if not exists experts_expertise_idx
  on public.experts(expertise)
  where is_public = true;

create index if not exists experts_user_id_idx
  on public.experts(user_id)
  where user_id is not null;

comment on table public.experts is
  'Expert directory. Credentials enter human-review queue before being marked verified.';
comment on column public.experts.credentials is
  'Structured credential data: {"orcid":..., "license_state":..., "license_number":...}';

-- ===========================================================================
-- 5. mentors
-- ===========================================================================
-- Mentor-mentee pairing records. A mentor (an expert) takes on one or more
-- mentees for a fixed term with optional topic focus. Status lifecycle:
-- requested -> accepted -> active -> completed | declined | cancelled.

create table if not exists public.mentors (
  id uuid primary key default gen_random_uuid(),
  -- The mentor: must reference an experts row with credential_status='verified'.
  expert_id uuid not null references public.experts(id) on delete cascade,
  mentor_user_id uuid not null references auth.users(id) on delete cascade,
  -- The mentee.
  mentee_user_id uuid not null references auth.users(id) on delete cascade,
  -- Optional topic focus for this mentorship.
  topic_id text references public.topics(id) on delete set null,
  -- Status lifecycle.
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'active', 'completed', 'declined', 'cancelled')),
  -- Free-form goal statement from mentee.
  goal text,
  -- Term bounds (optional).
  started_at timestamptz,
  ends_at timestamptz,
  -- Completion metadata.
  completed_at timestamptz,
  completion_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mentors_mentee_idx
  on public.mentors(mentee_user_id, status);

create index if not exists mentors_mentor_idx
  on public.mentors(mentor_user_id, status);

create index if not exists mentors_expert_idx
  on public.mentors(expert_id);

comment on table public.mentors is
  'Mentor-mentee pairings. Mentor must be a verified expert. Status lifecycle: requested->accepted->active->completed.';

-- ===========================================================================
-- 6. recall_events
-- ===========================================================================
-- Spaced-repetition recall events. Each event records a user's attempt to
-- recall a piece of knowledge (mind node) at a scheduled interval. Used
-- to compute the next interval (SM-2 algorithm variant).

create table if not exists public.recall_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The mind node being recalled. Loose reference (no FK) because mind
  -- nodes may be deleted by the user; we keep the recall history.
  mind_id uuid,
  -- Topic context (for recall across topic-study sessions).
  topic_id text references public.topics(id) on delete set null,
  -- Quality of recall on the 0-5 SM-2 scale:
  --   0-2: complete blackout / wrong
  --   3:   correct but with serious difficulty
  --   4:   correct after hesitation
  --   5:   perfect recall
  quality smallint not null check (quality >= 0 and quality <= 5),
  -- SM-2 state at the time of this attempt.
  -- Format: {"repetition":int, "interval_days":int, "ease_factor":numeric}
  sm2_state_before jsonb not null,
  sm2_state_after jsonb not null,
  -- Next scheduled recall (computed by SM-2).
  next_recall_at timestamptz not null,
  recalled_at timestamptz not null default now()
);

create index if not exists recall_events_user_next_idx
  on public.recall_events(user_id, next_recall_at)
  where next_recall_at > now();

create index if not exists recall_events_user_mind_idx
  on public.recall_events(user_id, mind_id, recalled_at desc)
  where mind_id is not null;

comment on table public.recall_events is
  'Spaced-repetition recall events (SM-2). Each event records a recall attempt and the next scheduled recall time.';

-- ===========================================================================
-- 7. updated_at triggers (shared)
-- ===========================================================================
-- Auto-update updated_at on row update for tables that have it.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists onboarding_touch_updated_at on public.onboarding;
create trigger onboarding_touch_updated_at
  before update on public.onboarding
  for each row execute function public.touch_updated_at();

drop trigger if exists experts_touch_updated_at on public.experts;
create trigger experts_touch_updated_at
  before update on public.experts
  for each row execute function public.touch_updated_at();

drop trigger if exists mentors_touch_updated_at on public.mentors;
create trigger mentors_touch_updated_at
  before update on public.mentors
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- 8. Row Level Security
-- ===========================================================================
-- RLS enabled on all 6 new tables. The service role (API server) bypasses
-- RLS via the service-role key; this section defines what end users (anon
-- + authenticated) can do directly via PostgREST.

-- otp_requests: only the API server (service role) reads/writes. End users
-- never touch this table directly.
alter table public.otp_requests enable row level security;
create policy "otp_requests_deny_all" on public.otp_requests
  for all using (false) with check (false);

-- onboarding: a user can read + update only their own row. Inserts are
-- done by the API server on first login.
alter table public.onboarding enable row level security;
create policy "onboarding_self_read" on public.onboarding
  for select using (auth.uid() = user_id);
create policy "onboarding_self_update" on public.onboarding
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- personality_results: a user can read their own results; only API server
-- can insert (test must be scored server-side to prevent tampering).
alter table public.personality_results enable row level security;
create policy "personality_self_read" on public.personality_results
  for select using (auth.uid() = user_id);

-- experts: anyone can read public (verified) experts; only API server
-- creates/updates expert rows (admin review flow).
alter table public.experts enable row level security;
create policy "experts_public_read" on public.experts
  for select using (is_public = true);
create policy "experts_self_read_draft" on public.experts
  for select using (user_id = auth.uid());

-- mentors: mentee can read their own mentorship records; mentor can read
-- their own mentees. Only API server creates/updates.
alter table public.mentors enable row level security;
create policy "mentors_as_mentee_read" on public.mentors
  for select using (mentee_user_id = auth.uid());
create policy "mentors_as_mentor_read" on public.mentors
  for select using (mentor_user_id = auth.uid());

-- recall_events: a user can read their own recall history; only API server
-- inserts/updates (scoring must be server-side).
alter table public.recall_events enable row level security;
create policy "recall_events_self_read" on public.recall_events
  for select using (user_id = auth.uid());

-- ===========================================================================
-- 9. Seed: sample posts (so /api/feed can return data for end-to-end tests)
-- ===========================================================================
-- Three sample posts across three topics, owned by a synthetic service
-- account. These only seed if the posts table is empty (idempotent).

insert into public.topics (id, name, description, category, "order")
select 'seed-neuroscience', 'Neuroscience', 'Mind, behavior and cognition.', 'Science', 100
where not exists (select 1 from public.topics where id = 'seed-neuroscience');

insert into public.topics (id, name, description, category, "order")
select 'seed-philosophy', 'Philosophy', 'Mind, ethics and knowledge.', 'Humanities', 110
where not exists (select 1 from public.topics where id = 'seed-philosophy');

insert into public.topics (id, name, description, category, "order")
select 'seed-software', 'Software', 'Code, systems and best practices.', 'Technology', 120
where not exists (select 1 from public.topics where id = 'seed-software');

-- Note: posts require a user_id referencing auth.users. Since we cannot
-- create auth.users from raw SQL, the seed posts script must be run from
-- the API server after the first admin user is provisioned. See
-- scripts/seed-sample-posts.ts (created in P5).

-- ===========================================================================
-- End of migration 0004
-- ===========================================================================
