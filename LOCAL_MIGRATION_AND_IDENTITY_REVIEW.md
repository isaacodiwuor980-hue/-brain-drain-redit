# Local migration and identity review

This is a preliminary static review, not proof of live schema, grants, policy correctness or route authorization. No staging or production was accessed. The user states none of the migrations is applied anywhere; independently verify history before any execution. The following migrations exist:

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

The separate 0011 setter rejects voters without explicit grants, contradicting the new requested 0.1 baseline: it is unwired and must be redesigned/tested before enabling. No user should be assigned authority just from self-declared tags. Neither email nor UUID-shaped Firebase subjects establish a valid mapping.
