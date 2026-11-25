# Live schema: limited read-only snapshot

**VERIFIED by read-only connector queries:** The connected project is now named BRAIN DRAIN REDIT. Supabase reported database, database-user, REST and auth health checks healthy. These status checks do not establish application correctness, data completeness or a backup. No user rows, user content, passwords or API keys were read. No database write or migration was performed.

## Migration history

`supabase_migrations.schema_migrations` returned these eight recorded migration names and versions:

| Version | Name |
|---|---|
| 20261105081821 | 01_security_and_rls_fixes |
| 20261105081844 | 02_data_integrity_and_missing_objects |
| 20261105081903 | 03_counters_notifications_search |
| 20261105081918 | 04_performance_indexes |
| 20261105081946 | 05_rpc_api_layer |
| 20261105082111 | 06_diagnostics_retention_and_fixes |
| 20261105082128 | 07_fix_diagnostics_fk_index_detection |
| 20261105082142 | 08_remaining_fk_indexes |

These names/versions do not correspond to the repository's `0001`–`0011` filenames. This does not establish that those SQL statements were never executed manually. Do not blindly apply, rewrite, or reapply migrations; actual object definitions and historical deployment must be reconciled first.

## Relevant public schema observations

- `posts.id` and `posts.topic_id` are text; `posts.user_id` is UUID with a foreign key to `auth.users`. `posts.tags` is absent from the selected complete column list. Branch feed code requests `tags` and repository migration `0010` would add it; current compatibility has not been tested against the live API.
- `reactions.user_id` is UUID with a foreign key to `auth.users`. Reaction uniqueness includes reaction type, so the constraint alone permits both upvote and downvote for the same user/target. This does not prove conflicting rows exist. The separate legacy REST writes are not a proven atomic update. No tier/source columns appeared in the selected complete column list.
- `follows` exists and uses UUID `follower_id` and `following_id`; `user_follows` does not exist. Branch Following feed currently queries `user_follows` and `followee_id`. Real app behavior has not been tested and must not be inferred from mocked tests.
- `topic_followers` and `user_topic_affinity` exist, with UUID user IDs. The latter has score and timestamps; its meaning, provenance and retention have not been verified and should not be treated as expertise.
- `user_identity_map`, `server_feature_flags`, `tiered_post_votes`, and `topic_authority_grants` are absent in public. Catalog lookup for `save_brain_atomic`, `set_post_reaction_atomic`, `toggle_post_reaction_atomic`, `set_tiered_post_vote`, and `preview_post_reaction` returned no public functions with those names. Branch brain, topic follow and personality routes expect identity mapping; brain save also expects the RPC. Without reviewed prerequisites these changes could fail closed or fail against this schema; no live route was exercised.
- Relevant indexes exist on posts (including creation, topic/creation, user), follows, reactions and topic followers. Their suitability under real workload is unverified. Relevant row-security flags are enabled, but policy names/roles alone do not establish safe effective access; grants, policy expressions, service-role paths and real two-user tests remain to be audited. `profiles` contains personal-detail fields and has a policy named “profiles are readable by everyone”; effective field exposure requires review, not an assumption.
- Selected trigger metadata showed follow count/notification, reaction notification/repost count, topic-follow count and updated-at triggers. Trigger bodies and side effects were not inspected. Installed extensions include pg_trgm and pgcrypto; vector was not listed.

## Limitations

The initial broad columns response was truncated. The targeted feed-related column query and targeted table-existence checks were complete; this is not a complete schema snapshot. Policy expressions, grants, all functions, trigger bodies, runtime behavior, data counts, account mapping coverage, backups, and migration SQL history beyond recorded names are unverified. The API is apparently reachable for metadata; this is not proof data is intact or all services work. Avoid displaying secrets, identifiers or content during follow-up.

## Release consequence

Do not merge or deploy PR #3 based solely on its green checks. It changes user-facing routes that depend on missing objects, and merging main may trigger configured deployment integrations. Before any change to a real database: establish backups, review existing definitions and deployment dependencies, design a safe forward-only plan, test against an isolated database, and obtain explicit approval. Preserve existing user data. Use `FEED_DESIGN.md` and `FEED_PROGRESS_LOG.md` for the broader feed blockers.

## Later read-only feed metadata check

**VERIFIED from catalog metadata, 2026-11-16:** `posts`, `brains`, `topics`, and `reactions` have RLS enabled but not forced, and are owned by `postgres`. The `service_role` has BYPASSRLS and SELECT on posts, brains and reactions; `anon` and `authenticated` also have SELECT. The visible `posts` SELECT policy is `true` for anon/authenticated, while the brains SELECT policy is `is_public = true OR author_id = auth.uid()`. Thus a public post's `brain_id` can reveal a private brain identifier; the feed's service-role access also cannot rely on RLS for per-user filtering. This is a schema/configuration finding, not evidence that such an experimental post exists or that any personal records were read. Effective access must still be verified under real restricted roles and through all paths.

The later complete columns query lists `posts.tags`, contrary to the earlier snapshot above. The source and timing of this schema change are unknown; no migration was applied by this session. Refresh and reconcile deployment/migration history instead of assuming the old observation remains current. `user_identity_map`, feature flags, interest preferences/topics, experimental account events/preferences, tiered votes and authority grants were absent in this targeted check. Missing tables do not prove every possible source of signals is absent. No content, user rows, key values, database writes or deployments were involved.

## Later read-only metadata recheck — 2026-11-16

The connected project's provider metadata reported `ACTIVE_HEALTHY`; read-only health checks for `db` and `rest` returned healthy. This is not a backup, restore or application test. The provider listed the same eight migration names/versions shown above; this does not rule out manual SQL or establish equivalence to repository files.

A targeted catalog-only `pg_class`/`pg_namespace` query for selected objects returned `brains`, `follows`, `posts`, `reactions`, `skills`, **and `user_follows`** as public tables, with RLS enabled but not forced and owner `postgres`. The earlier snapshot said `user_follows` was absent. This is an unexpected difference; its source, columns, policies, grants, data provenance and compatibility are unknown. The selected query did not find `user_identity_map`, `server_feature_flags`, `tiered_post_votes`, or `topic_authority_grants` as ordinary or partitioned public tables. It does not establish whether other kinds of objects exist under those names. **Stopped live inspection on the unexpected schema difference; no automatic repair or further live query.** An authorized operator should reconcile the change history and current definitions without exposing personal rows before a reviewed forward migration is proposed. No user records, secrets, migration writes, deployments, or flags were accessed or changed in this recheck.
