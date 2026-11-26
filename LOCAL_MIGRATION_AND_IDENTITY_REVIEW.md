# Local migration and identity review

This is a preliminary static review, not proof of live schema, grants, policy correctness or route authorization. No staging or production was accessed. Historical reports about prior SQL execution conflict; actual migration history is unknown. An authorized operator must verify it before any execution. Do not treat existing migrations as safely unapplied or rewrite potentially applied files; use independently reviewed forward fixes. The following migrations exist:

| Migration | Principal objects / dependencies | RLS status in repository |
| --- | --- | --- |
| 0001 | pgcrypto; auth.users/auth.uid; profiles, topics, topic_followers, brains, brain_nodes, posts, comments, reactions, missions, milestones, xp_events, reputation, communities, community_members, check_ins, conversations, conversation_participants, messages, notifications, pathways, analytics_events, user_topic_affinity, post_scores, brain_scores, mission_scores; indexes/triggers/functions | RLS enabled on each listed table, policies vary by table; public profile and reaction reads are intentional in SQL but must be reviewed against privacy requirements. Grants and policy behavior unverified in real Supabase. |
| 0002 | optional pgvector; skills, FTS function/trigger/index; optional embedding/index/match_skills | skills RLS not enabled here; potential exposure depends on grants; blocker. |
| 0003 | 0001 profiles: salt/contact hashes and partial indexes | profiles inherits 0001 RLS; public row reads could expose hashes depending on column grants; blocker. |
| 0004 | auth and 0001 brains/topics; otp_requests, onboarding, personality_results, experts, mentors, recall_events, indexes, touch trigger and policies | RLS enabled on each of the six tables; policy/grant behavior requires real Supabase. |
| 0005 | 0001 brains/nodes and auth; save_brain_atomic RPC | no new table; function execute grants require independent review. |
| 0006 | 0001 reactions, posts, auth; tier column; user_tag_authority, user_cluster, post_velocity_hourly, covote_edge, ring_identity, post_flag_state, post_accuracy_label, user_cohort_fingerprint, daily_stake_budget, tsrg_jobs | RLS enabled for all ten new tables; no client policies, client grants revoked in migration; service role bypasses RLS. |
| 0007 | 0001/0006; user_identity_map, server_feature_flags, reaction marker and toggle RPC | RLS enabled on both new tables, no client policies and client grants revoked; service role bypasses RLS. |
| 0008 | 0007 mapping and 0001/0006 reactions; atomic setter | no new table; function grants require real role review. |
| 0009 | 0001/0006 reactions; preview RPC | no new table; function grants require real role review; not wired. |
| 0010 | 0001 posts; tags column | posts retains existing 0001 RLS/policies; inspect actual column privileges. |
| 0011 | 0001 topics/posts, auth, 0007 mapping; topic_authority_grants, tiered_post_votes, setter | RLS enabled on both; no client policies, client grants revoked; service role bypasses RLS. |

0002 and 0004 were edited locally to fix nested quoting and a non-immutable index predicate; 0002 attempts pgvector installation but skips the semantic blocks when extension files/privileges are missing. A local PGlite fixture with stub auth and no pgvector applies 0001–0011 in order and re-applies 0005–0011, not 0001–0004 (0001 has unconditional policy creation). The vector-enabled path and true Supabase extensions are untested. SQL filtering by time must occur in application queries, not via the removed predicate.

## Preliminary route identity inventory

Identity mapping is not provisioned. Static inspection does not prove all route paths or actual database types; Firebase subjects are arbitrary strings and cannot be assumed UUIDs. `skills` in 0002 lacks route-assumed `author_id`, and the habits schema is not defined in these migrations. No new route mapping fixes were made in this session.

| Route area | Current identity / schema indicated in repo | Status |
| --- | --- | --- |
| me, protected brains | mapped UUID (brains author_id UUID); brain public reads optionally resolve mapping | mocked/PGlite tests only; provisioning missing |
| posts and ordinary reactions | Firebase uid; posts/reactions user_id UUID | mismatch; not fixed |
| feed | Firebase uid for reactions/follows; reactions.user_id and topic_followers.user_id UUID | mismatch; not fixed |
| topic follows | Firebase uid; topic_followers.user_id UUID | mismatch; not fixed |
| discover / follows | Firebase uid; profile id UUID; follower schema unverified | mismatch or unknown; not fixed |
| skills | Firebase uid; skills.author_id absent from migration 0002 | schema and mapping blocker |
| habits | Firebase uid; author_id type/schema not in migration set | unknown; needs schema review |
| expert applications / review | Firebase uid; experts.user_id/reviewed_by UUID | mismatch; not fixed |
| onboarding, personality, recall | Firebase uid; user_id UUID | mismatch; not fixed |
| mentors | Firebase uid; participant UUIDs | mismatch; not fixed; ownership enforcement needs full write-path review |
| notifications, settings, saves, messaging | no complete cloud route audit completed | unverified; cloud lifecycle export/delete not implemented |
| analytics/events, recommendations, client errors, data API | separate routes; identity, data retention and authorization not comprehensively audited | unverified |

The 0011 setter is unwired; see the Session A addendum below for its updated baseline behavior and unresolved snapshot policy. No user should be assigned authority just from self-declared tags. Neither email nor UUID-shaped Firebase subjects establish a valid mapping.

## Session A per-route inventory (static inspection)

All paths in `api-server/src/routes/index.ts` are listed below; test files are excluded. This inventory identifies identity sources, not a completed authorization or schema audit. Where a schema is absent, do not assume a type. Identity mapping lookup is server-side; it does not derive identities from email. `requireMappedIdentity` returns 403 `Identity mapping required`, or 503 on lookup failure; `/me` currently deliberately returns 401 on unmapped and remains inconsistent.

| Route file | Before → after; target column | Status |
| --- | --- | --- |
| `brains.ts` | mapped UUID → mapped UUID, brains.author_id UUID; optional-auth public paths resolve mapping for private data | previously implemented; mocked tests only |
| `me.ts` | mapped UUID → mapped UUID, user_identity_map.supabase_uid UUID | previously implemented; unmapped status 401 inconsistent |
| `topics.ts` | follow Firebase UID → mapped UUID, topic_followers.user_id UUID; topic creation has no owner column | follow has mocked identity tests; topic creation unchanged |
| `personality.ts` | Firebase UID → mapped UUID, personality_results.user_id UUID | submit/read have mocked identity tests |
| `posts.ts` | Firebase UID → unchanged; posts.user_id/reactions.user_id UUID | not fixed; ordinary reactions are in this file; writes are non-atomic |
| `feed.ts` | optional Firebase UID → unchanged; posts/reactions.user_id UUID, user_follows schema absent | not fixed; anonymous read must remain public |
| `discover.ts` | Firebase UID → unchanged; topic_followers.user_id/profiles.id UUID; user_follows schema absent | not fixed; public search path must remain public |
| `experts.ts` | Firebase UID → unchanged; experts.user_id/reviewed_by UUID | not fixed; reviewer's verified email is an admin gate, not a mapping |
| `onboarding.ts` | Firebase UID → unchanged; onboarding.user_id UUID | not fixed |
| `recall.ts` | Firebase UID → unchanged; recall_events.user_id UUID | not fixed; brain association authorization also needs review |
| `mentors.ts` | Firebase UID → unchanged; mentee_user_id/mentor_user_id UUID | not fixed; conditional-write authorization also needs review |
| `skills.ts` | Firebase UID → unchanged; author_id is absent in 0002, reviewer_id TEXT | author identity schema decision required; reviewer_id semantics unknown |
| `habits.ts` | Firebase UID → unchanged; habits schema absent | schema/identity decision required; owner-conditioned writes need review |
| `search.ts` | public search, no caller identity; skills schema | unchanged; published filtering mocked only |
| `events.ts` | no authenticated identity; analytics storage has session/event IDs, analytics_events.user_id UUID nullable in 0001 | no user mapping; ingestion privacy/consent needs audit |
| `client-errors.ts` | no authenticated identity; logs client payload, no owned DB column | unchanged; logging/privacy needs review |
| `recommendations.ts` | no authenticated identity; reads analytics-store events | unchanged; data sensitivity/cache audit needed |
| `data-api.ts` | public dataset/search; no mapped user column in this route | unchanged; corpus/claim review separate |
| `health.ts` | no user identity; readiness reads public topics | unchanged |
| `tsrg-status.ts` | no user identity; reads server_feature_flags | unchanged; cooperating online clients only |
| `index.ts` | router registration only | no direct identity handling |

There are no separate API route files for notifications, settings, saves or messaging in this router inventory. Tables notifications/messages have UUID user/sender/participant columns in 0001; client-local features and other server entry points must be separately checked, not assumed covered. `server.ts` also has sitemap, llms, data-quality and frontend-serving routes, not included above as owned-data APIs.

0011 now stores 0.1 for users without an active grant in the post's actual topic (including revoked grants); grant and snapshot constraints enforce 0.1–1. This is an **unwired** local change, not a claim of real expertise. Existing snapshot scores remain historical if a grant is revoked or the post changes topic; any future aggregate must define and enforce revocation/topic-change policy before use. Tests changed the prior denial assertion because the user explicitly requested baseline voting. Independent database concurrency and grant-insertion races are not tested.

## Current stop: schema and migration-history conflict

A historical entry in `worklog.md` (around lines 3188–3214) describes a user running initial-schema and search SQL in a Supabase project. This is unverified historical prose, not proof of the present database state or exact applied migration versions. It conflicts with the current statement that no migration was applied anywhere. Separately, `skills.author_id`/`updated_at`, `habits`, and `user_follows` do not have authoritative schema definitions in the migration set. The identity fix depends on those actual types and existing ownership values. **Stop before assuming either that no history exists or that those columns store Firebase subjects.** Do not access staging/production in this session; an operator must resolve the discrepancy and schema independently through an approved process. Existing local edits to 0002/0004/0011 were made in previous sessions under the stated assumption of no applied migrations; if corresponding versions were applied anywhere, they need a reviewed immutable-history and forward-fix plan, not silent reapplication.

No identity enforcement mode was added in this session. Current protected brain, personality and topic-follow paths already fail closed without mapping. `GET /api/me` still differs in status; other listed routes still need mapping and authorization work. The requirement to finish workstream 1 before later workstreams remains unmet.

## User-provided historical reconstruction (not a current schema snapshot)

The user supplied a handoff from an earlier workspace based on worklog and a reportedly November 2026 OpenAPI export. It reports that initial-schema and search SQL were pasted into a Supabase SQL editor, that skills and habits existed with manually changed schemas, and that `user_follows` was absent at the time of the export. This is stronger historical evidence of prior application than the previous assumption, but the original export was not provided here and it does not establish today's state, data ownership, privileges, migration version metadata, or whether any project is disposable. Manual SQL does not necessarily appear in `supabase_migrations.schema_migrations`.

The original handoff contradicted itself about owner types; the user subsequently supplied the other agent's correction. That agent reports that its historical November 5 OpenAPI export shows `skills` and `habits` owner and reviewer columns as UUID and `updated_at` as timestamptz. The export itself was not supplied here, so this is a **reported historical observation**, not independently verified or current database evidence; OpenAPI alone does not establish foreign keys or RLS. Repository migration 0002 has no `skills.author_id` and defines `reviewer_id` as TEXT, and habits has no migration. TypeScript `string` does not establish the database type. Do not presume current types or Firebase-subject semantics. The historical no-users probe is time-limited and does not authorize reset or deletion.

Local Git comparison to base `ef324da` confirms 0001 is unchanged, while 0002 and 0004 were edited on this branch. A previous user instruction said 0001/0002 might be restored if live tables exist; do not assume the repository base exactly matches the SQL actually pasted, or silently restore/replace an applied migration. Until the operator supplies reviewed schema and migration history, treat 0001/0002 as potentially applied/immutable and reconcile through an explicit forward-migration plan. 0004 and later application status is likewise unknown. An identity map is defined in local migration 0007, but the current branch contains no provisioner that creates corresponding auth.users and mappings; it cannot alone fix missing FK targets. The requested identity enforcement mode is also not implemented. `LIVE_SCHEMA_SNAPSHOT.md` remains absent. No database was accessed or changed here.
