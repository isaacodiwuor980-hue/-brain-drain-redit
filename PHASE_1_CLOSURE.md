## What this phase delivered

Verified pre-closure commit: `b0abda95ea4b5d18950fca8c70de2e64b6c4a34c` on `arena/7af7488e-brain-drain-redit`. The local pre-closure run passed 229 tests in 44 files, typecheck and build; ESLint reported 0 errors and 2 warnings. The following capabilities are in that commit, not evidence of deployment:

- Local-first brain persistence and synchronization exist in `lib/db.ts`, `lib/brain-merge.ts`, `lib/api/brains.ts`, `hooks/use-database.ts` and `lib/brains-sync.test.ts`; covered by `lib/db.brain-transaction.test.ts`, `lib/api/brains.test.ts` and `lib/brains-sync.test.ts`.
- An atomic brain-save migration and API path exist in `supabase/migrations/0005_atomic_brain_save.sql` and `api-server/src/routes/brains.ts`; covered by `api-server/src/routes/brains.atomic.test.ts` and `api-server/src/routes/brains.http.test.ts` with PGlite or mocks.
- One-to-one identity-map schema, mapping middleware and an authenticated self-lookup exist in `supabase/migrations/0007_identity_reactions_flags.sql`, `api-server/src/middleware/identity-map.ts` and `api-server/src/routes/me.ts`; covered by `lib/tsrg/p0.integration.test.ts`, `api-server/src/middleware/p0-gates.test.ts` and `api-server/src/routes/me.http.test.ts`.
- TSRG math and opt-in local feed ordering exist in `lib/tsrg/index.ts`, `lib/tsrg/feed.ts` and `hooks/use-social.ts`; covered by `lib/tsrg/index.test.ts` and `lib/tsrg/v2.test.ts`.
- TSRG staging schema and default-off flag records exist in `supabase/migrations/0006_tsrg_foundation.sql` and `supabase/migrations/0007_identity_reactions_flags.sql`; covered by `lib/tsrg/schema.integration.test.ts` and `lib/tsrg/p0.integration.test.ts`.
- A server status endpoint and cooperating client check exist in `api-server/src/routes/tsrg-status.ts` and `hooks/use-tsrg-status.ts`; covered by `api-server/src/routes/tsrg-status.http.test.ts` and `hooks/use-tsrg-status.test.tsx`.
- An unwired reaction toggle RPC, desired-state setter and read-only setter preview exist in migrations `0007`, `0008`, and `0009`; covered by `lib/tsrg/p0.integration.test.ts`, `lib/tsrg/set-reaction.integration.test.ts` and `lib/tsrg/reaction-preview.integration.test.ts`.
- Story text escaping and dataset-metadata wording exist in `feed/StorySafeText.tsx`, `feed/StoriesBar.tsx` and `api-server/src/routes/data-api.ts`; covered by `tests/story-safe-text.test.tsx` and `api-server/src/routes/data-api.claims.test.ts`.
- Mobile navigation, offline queue and related local behavior exist in `layout/AppShell.tsx`, `layout/MobileNavDrawer.tsx`, `lib/navigation.ts` and `lib/offline-sync.ts`; covered by `tests/mobile-nav.interaction.test.tsx`, `tests/navigation.test.ts`, and `lib/offline-sync.test.ts`.
- A readiness ledger, operational notes and decision list exist in `lib/tsrg/P0_READINESS.md`, `RUNBOOK.md`, `ENGINEERING_AUDIT.md` and `DECISIONS_NEEDED.md`; these are documentation, not production validation.

## What this phase did NOT deliver

- Real Supabase RLS, effective grants, role inheritance, service-role endpoint authorization and deployed-schema compatibility are unverified; local tests use PGlite or mocks. `0002` creates `skills` without enabling RLS in that migration, and `0003` adds hashes to publicly readable profiles; effective exposure requires review.
- Identity mapping is wired into `GET /api/me`, not the other existing user-data paths. Confirmed direct Firebase-subject use includes `brains.ts`, `posts.ts`, `feed.ts`, `topics.ts`, `onboarding.ts`, `personality.ts`, `experts.ts`, `mentors.ts` and `recall.ts`.
- `api-server/src/routes/brains.ts:213` reads `req.auth!.uid` (the Firebase `sub`) and line 221 passes it as `p_uid`; `0005` requires `p_uid uuid`. No `req.mappedUserId` is used there. Non-UUID Firebase subjects will fail UUID conversion, and UUID-shaped subjects are not necessarily the correct mapped owner. This is a deployment blocker; a separately reviewed integration and tests are needed before relying on this path. Missing 0005 also causes the route to fail closed. Whether either condition affects a deployed environment is unknown.
- This session applied no migration to staging or production. The target database's migration history, including 0005, is unknown; do not assert it is absent everywhere.
- **Correction to earlier ledger wording:** migration `0006_tsrg_foundation.sql:14` adds `reactions.tier` with default `mouth` and four allowed values. `0007` separately adds `reaction_tier_source`. The default is compatibility data and does not establish an explicit user choice. Migration `0009`'s comment and earlier readiness entries saying no tier field exists are inaccurate after 0006; the preview does not inspect or model that tier. This closure session does not modify migrations or application code.
- The desired-state setter in 0008 and preview in 0009 are unwired. The preview returns a null concurrency token and describes 0008, not the existing toggle route. `created_at` does not change on updates; a state hash can repeat after A→B→A. Neither is a reliable concurrency version or safe shadow mechanism.
- Migration `0002_search.sql` explicitly runs `CREATE EXTENSION IF NOT EXISTS vector` and uses the same `$$` delimiter for an inner function within an outer `DO $$` block. Extension availability and fresh-run SQL behavior are unverified; the claimed graceful skip is not ensured by that statement. Migration `0004_community_rebuild.sql:242–244` also uses `now()` in a partial-index predicate, which needs PostgreSQL immutability review. Do not apply the chain blindly.
- No real independent concurrent-writer, multi-user Supabase, adversarial authorization, browser or Android-device validation was performed in this phase.
- No stake, slashing, penalties, corpus delivery or full TSRG rollout was implemented. The experimental feed remains opt-in in code, but its real deployment/flag state is unknown; it is not safe to assert no user has enabled it.
- `GET /api/tsrg/status` is a soft switch for cooperating online clients only. Offline or older clients and delayed polling cannot be controlled absolutely. It is not an authorization boundary.
- `pages/SettingsPage.tsx` has an IndexedDB-only JSON export and a local-data-clearing button labelled account deletion; it does not establish complete authenticated cross-service export or deletion. The local-clearing operation is destructive to browser data, not a dry run.
- `public/privacy-policy.html` and `public/terms-of-service.html` exist and make retention/export/deletion claims; implementation, accuracy, legal review and enforceability are unverified. Data rights, retention, licensing and external deletion paths remain unresolved.
- No real-user identity mapping coverage, live backups or deployment state were verified. PGlite fixtures and local tests do not prove production safety. See `DECISIONS_NEEDED.md`, `ENGINEERING_AUDIT.md`, `RUNBOOK.md` and `lib/tsrg/P0_READINESS.md` for additional limitations and unresolved decisions.

## What must happen on staging before any production deployment

The 1–11 steps in `NEXT_SESSION_STAGING_CHECKLIST.md` are the detailed plan. Do not begin without explicit approval; applying a migration on isolated staging is not authorization for production.

1. **Operational:** Confirm a separate staging target and verified backup/restore procedure. Evidence: non-secret project identity confirmation, scope and written authorization.
2. **Technical:** Review migrations `0001`–`0009`, including 0002 vector/nested quoting and 0004 partial-index predicate. Evidence: reviewed prerequisites, dependencies and documented blockers before applying anything.
3. **Technical / operational:** Apply only reviewed, authorized, unapplied migrations in dependency order on isolated staging. Evidence: sanitized before/after table, column, function, grants, policy and migration-state inventories for each application; stop on any failure. Do not apply 0005 twice.
4. **Technical:** Audit RLS and effective grants for `0006` and `0007` tables and relevant existing tables. `0005` and `0009` create functions, not tables. Test anon, two authenticated non-owner identities and service role according to each intended access contract; test authenticated API endpoints separately because the backend uses service-role access. Evidence: sanitized role-specific results and authorization checks. Client-side key exposure or unauthorized API access is a stop; backend service-role use alone is not.
5. **Technical / operational:** Provision verified disposable mappings for two test users and test `GET /api/me` including an unmapped user. Evidence: sanitized outcomes and verified mapping lifecycle; do not infer identity from email.
6. **Technical / approval:** Fix brain-save identity mapping in a separate explicitly authorized, reviewed code session; include other ownership reads/writes as appropriate. Evidence: code review, relevant tests and staged mapping behavior. This is a release precondition, not work authorized by the staging verification checklist.
7. **Technical:** Once 0005 and the separately reviewed mapping fix are available on isolated staging, run independent controlled concurrent saves against the same disposable brain ID. Derive expected statuses from the implementation and verify ownership and no partial writes. Evidence: sanitized results from both sessions and final data state.
8. **Technical:** Compare 0009 preview with the 0008 setter in isolated disposable test data under controlled snapshots. Evidence: comparisons and unchanged data after preview; this is not a validation of live shadowing or of the current toggle route.
9. **Technical:** Run the local suite and specifically configured staging integration tests; identify tests that remain mocked or PGlite. Evidence: exact non-secret commands and results.
10. **Legal/privacy / operational:** Decide data retention, complete export/deletion coverage, content rights, privacy notices and backup/restore policy. Evidence: reviewed decisions and applicable legal/operational sign-off, not assumptions from code.
11. **Operational:** Write `STAGING_VERIFICATION.md` with sanitized commands, results, deviations, blockers and final status `Staging verification: COMPLETE` or `Staging verification: BLOCKED at step N because …`. Staging completion alone is not production clearance.

## Explicit "do not do" list for the next session

- Do not add features, enable TSRG features or claim production readiness.
- Do not add a migration unless a specific gap is identified and a separately reviewed fix is explicitly authorized; do not modify an applied migration.
- Do not skip a check because it passed locally, touch production, or use production data.
- Do not call mutating RPCs as live shadows on real data.
- Do not infer identity from email or assume populating the identity map changes existing routes; the relevant routes must use the verified mapping.
- Do not expose service-role credentials, tokens, user data or database connection strings in logs or handoff files.

## Commit and push state

Before closure: branch `arena/7af7488e-brain-drain-redit`, commit `b0abda95ea4b5d18950fca8c70de2e64b6c4a34c`, clean working tree; `git ls-remote` showed the same commit on the branch. This document cannot truthfully contain the hash of the commit that first contains it. See the final session report and Git history for the actual closure commit and push outcome.
