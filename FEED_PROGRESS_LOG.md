# Feed work progress

## Coverage repair and database inspection — stopped on access failure

**VERIFIED (ran it):** Starting branch `arena/7af7488e-brain-drain-redit`, checkpoint `b7f4f26`, working tree clean, so no extra checkpoint commit was needed. Installed `@vitest/coverage-v8` pinned to 4.1.12, matching installed Vitest; package lock updated. `CI=1 npx vitest run --coverage` passed 352 tests / 70 files. `npm run lint` (includes typecheck) passed with zero errors and two existing warnings. `npm run build` passed. `git diff --check` passed.

Coverage baseline, percentages in order statements / branches / functions / lines, from the V8 text report:

| File | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| api-server/src/routes/feed.ts | 75 | 69.23 | 81.81 | 75.23 |
| api-server/src/routes/posts.ts | 64.70 | 60.52 | 100 | 63.07 |
| hooks/use-social.ts | 3.24 | 6.09 | 2.85 | 2.96 |
| lib/recommendations.ts | 40.93 | 20.14 | 44.68 | 40.15 |
| lib/post-votes.ts | 95.12 | 89.18 | 100 | 95 |
| lib/api/feed.ts | 14.28 | 13.63 | 33.33 | 17.64 |
| lib/tsrg/feed-ranking.ts | 100 | 100 | 100 | 100 |
| lib/tsrg/feed.ts | 100 | 80.95 | 100 | 100 |
| lib/tsrg/index.ts | 96.20 | 95.49 | 100 | 97.95 |

The reported aggregate for files included by the current Vitest configuration is 59.98 / 52.70 / 55.91 / 61.09. **UNVERIFIED:** this is not a complete project-wide coverage figure: unimported files such as `pages/HomeFeed.tsx` were absent from the report. 100% for isolated code does not prove integration, safety or production behavior. To reproduce: `CI=1 npx vitest run --coverage`.

**VERIFIED (ran it):** Supabase connector listed one project named BRAIN DRAIN. Read-only requests for migration history and catalog metadata failed with database authentication error `28P01`. No migration or data-changing query was sent. No user records or credentials were requested. No actual schema, RLS, functions, indexes, triggers, extensions, or migration history was obtained, and recorded-vs-actual comparison remains unknown. Stop rather than retrying or bypassing the provider error.

**UNVERIFIED / blocked:** Home-page ordering fix, full identity inventory, migration plan, new feed pipeline, server-controlled immediate kill switch, privacy controls, points ledger, reviewed expert-tag workflow, actual concurrent reaction guarantees, real DB authorization, and complete production readiness. Existing status endpoint is a cooperating-client soft switch only. Do not assume linked app or write migrations based on the unsuccessful inspection. The four separately documented security and migration-history issues remain go-live blockers.

**Next:** Resolve Supabase database connectivity without sharing passwords or tokens here. After the connector is healthy, re-run only approved read-only catalog and migration-history inspection; compare actual schema with local files, then plan and implement safely with no live writes.

## Offline feed ordering scaffold

**VERIFIED (ran it):** Starting checkpoint `fd34fe5` was clean. Added isolated `lib/tsrg/feed-pipeline.ts` with validated candidate inputs, caller-supplied rules/model scorers, configurable model blend, deterministic seeded tie-breaking and fallback to rules for the entire set if the optional model fails. `lib/tsrg/feed-pipeline.test.ts` first failed at import because the module did not exist; after implementation all 3 tests passed, including 100 repeated runs. The first failure was a missing module, not an existing behavior regression.

**VERIFIED (ran it):** `CI=1 npx vitest run --coverage` passed 355 tests / 71 files. The new file reports 100% statements, 86.95% branches, 100% functions and 100% lines; coverage proves only these executed paths, not production readiness. `npm run lint` including typecheck passed with 0 errors and 2 existing warnings; `npm run build` passed; local app started and `/` returned HTTP 200; browser behavior was not verified. `git diff --check` passed.

**UNVERIFIED / not implemented:** The scaffold is not connected to UI, switches, data sources, candidate generation, diversification, interest/privacy, expert review, points, safety filtering, pagination, online fallback or logging. It is not the complete pipeline and does not prevent manipulation. Scorers must be pure and trusted; scores and seeds are not factual truth or proof of expertise. Actual feed and legacy ordering remain unchanged. The Management API database authentication error and unhealthy health-check reports do not establish why the failure occurred or prove the database is down. The connector reported region `eu-west-1`; another account reported `eu-central-1`; this discrepancy remains unresolved. No new live database operation was made.

## Offline diversity and feed design

**VERIFIED (ran it):** Starting checkpoint `a975ce0` was clean. Added `diversifyOffline`, an unwired best-effort rolling cap algorithm preserving all posts, with caller-provided author/topic/source caps. Before implementation its 3 tests failed because the function was absent; afterwards all 3 passed, and the existing pipeline tests passed too. `CI=1 npx vitest run --coverage`: 358 tests / 72 files passed. `feed-pipeline.ts`: 98.11% statements, 90.41% branches, 100% functions and 100% lines, limited to executed paths. `npm run lint` including typecheck: 0 errors, 2 existing warnings; build passed. One local synthetic run for 1,000 candidates returned all 1,000 in 4.91 ms; this is not a production latency benchmark or worst-case bound. `git diff --check` passed.

**UNVERIFIED:** Best-effort caps can be exceeded when the pool lacks alternatives; exploration percentage, measured fairness, server/UI integration, real-time kill switch, real database schema and independent concurrent reaction safety remain absent. The function is quadratic in the worst case. No deployment, flag enablement, live SQL or migration took place. See `FEED_DESIGN.md` for assumptions and release blockers.

## Offline interest numeric edge case

**VERIFIED (ran it):** Starting checkpoint `2377ed8` was clean. For an extremely tiny permitted prior and completely decayed exposure, `interestFromExposuresV3` returned zero instead of neutral 0.5 because halving the prior underflowed. `npx vitest run lib/tsrg/interest-prototype.test.ts` demonstrated one failing regression; centering the arithmetic on 0.5 makes the same test pass. The function is an unwired experiment; no legacy or user-facing feed behavior changed. Focused tests: 14 passed. `CI=1 npx vitest run --coverage`: 359 tests / 72 files passed; index.ts 96.2% statements, 95.49% branches, 100% functions, 97.95% lines. `npm run lint` (includes typecheck) and `npm run build` passed with 0 errors and 2 existing lint warnings. Local app started and `/` returned HTTP 200; no full browser flow was tested. No live database query or modification was made.

**UNVERIFIED:** Data loss is not established by Management API authentication failure or failed health probes. Creating a replacement project does not recover accounts, data, migrations or configuration; backup and recovery status remain unknown. A separate test project is a possible later option, subject to pricing, project limits and explicit authorization, but must not replace or alter the current project without a reviewed migration and rollback plan. Significant feed implementation and release gates remain, not just one manual task.

## Offline model-input isolation

**VERIFIED (ran it):** Starting checkpoint `546b3d5` was clean. A regression demonstrated that a model scorer could mutate caller-owned signal data before throwing, even though rule-score fallback ran. The same test passes after supplying scorers with frozen, minimal snapshots. This is data isolation for those explicit arguments, not a security sandbox: callbacks may still use external references or side effects and must be trusted and pure. The prototype remains unwired.

Focused tests: 7 passed. `CI=1 npx vitest run --coverage`: 360 tests / 72 files passed. `feed-pipeline.ts`: 98.18% statements, 90.41% branches, 100% functions and 100% lines for recorded tests. `npm run lint` including typecheck and `npm run build` passed; lint had 0 errors and 2 existing warnings. Local app started and GET `/` returned HTTP 200, not a browser or integration test. `git diff --check` passed. No live database access, deployment or feature enablement.

**UNVERIFIED / still required:** real feed integration and order preservation, robust server kill switch, account privacy controls, expert review, atomic reaction/points ledger and concurrent PostgreSQL verification, reliable exposure collection, identity and schema reconciliation, and launch gates. A database authentication error does not prove data loss; neither a new project nor a deployment is authorized by this batch.

## Draft PR merge review

**VERIFIED (ran it):** PR #3 was draft, GitHub reported merge state CLEAN and the prior quality check passed. Its Docker, staging and Supabase preview checks were skipped on the PR. The quality job was named “Lint + Typecheck + Test + Build” but had no lint step; added `npx eslint .` to make that check actually run lint. Locally `npm test` passed 360 tests / 72 files; `npm run lint` including typecheck passed with 0 errors and 2 existing warnings; `npm run build` and `git diff --check` passed. The changed GitHub Actions run must be checked after pushing; local success does not prove remote execution.

**UNVERIFIED / merge blockers:** PR #3 contains changes across 178 files relative to its original base, not only the offline feed. Some brain, topic-follow and personality routes now require identity mappings, but provisioning and the actual Supabase schema/migration history are not verified. Old migration files have changed in the branch and may already exist in a live database. The workflow has a staging deploy job on pushes to main if configured; other deployment integrations are unknown. Therefore a green CI badge and a clean merge status do not establish that merging is safe or deployment-free. Keep this PR draft and do not merge until schema/identity/deployment prerequisites and rollout/rollback are independently reviewed. Full feed integration, atomic reactions/points, privacy controls and kill switch are also unfinished. No Supabase query, live write, deployment or merge was performed.

## Read-only connected database inspection

**VERIFIED (ran it):** Supabase reported database, database-user, REST and auth checks healthy, and read-only schema queries succeeded. `LIVE_SCHEMA_SNAPSHOT.md` records the limited results without user rows or secrets. Eight recorded historical migrations have different names/versions from local `0001`–`0011`; a recorded-history absence does not rule out manual execution. Selected live tables use UUID user IDs. `follows` exists but `user_follows` does not. `posts.tags`, `user_identity_map`, `server_feature_flags`, tiered-vote tables and selected new RPC names are absent. The branch's feed and protected routes depend on several missing objects. No real route was exercised; actual data, backups and effective access remain unverified. The first broad column result was truncated; targeted lists were complete. No live writes, migrations, deployment or merge took place.

**Decision: BLOCK MERGE.** These real mismatches make blind deploy or migration unsafe. Design and review a forward-only reconciliation plan with backups, identity provisioning and isolated tests first. Do not assume PGlite or green PR checks prove production compatibility. GitHub's latest quality check at `506a423` passed; Docker, staging and Supabase preview checks were skipped for that PR event.

**VERIFIED (ran it):** After the read-only inspection, `npm test` passed 360 tests in 72 files; `npm run lint` including typecheck and `npm run build` passed, with 0 lint errors and 2 existing warnings. `git diff --check` passed. This verifies local checks only, not the connected database's runtime behavior.

## Local tier eligibility V2 and database plan

**VERIFIED (ran it):** Existing local 0011 setter accepts Life with baseline 0.10; its legacy behavior was deliberately retained. A separate local migration 0012 adds a service-only setter applying 0.10/0.35/0.55/0.75 thresholds. The initial new test run failed because the migration file was missing, not because the same deployed API was fixed; after creation the local PGlite tests passed. A separate rollback script removes only the new function; local tests check preserved vote rows and migration reapplication. No Supabase SQL, migration, flag or deployment was executed.

`CI=1 npx vitest run --coverage`: 371 tests / 73 files passed. `npm run lint` including typecheck passed with 0 errors / 2 old warnings; `npm run build` and `git diff --check` passed. Coverage tool reports 60.55% statements / 53.81% branches / 56.91% functions / 61.55% lines across the files it included, not all repository files and not SQL coverage.

**UNVERIFIED / blockers:** This is not a points ledger or a live implementation; it lacks account-age checks, idempotency, action ordering, protection from existing REST writers, real independent concurrent PostgreSQL sessions, mapped identity provisioning, real RLS/effective privileges and live routes. The underlying legacy setter remains available to service role and does not enforce these limits. No release or merge recommendation. `FEED_SUPABASE_PLAN.md` contains risk, sequencing, verification and rollback proposals; these require review and separate approval before any database operation.

For safety, the V2 SQL was moved from the automatic migration directory to `supabase/proposals/0012_tier_eligibility_v2.sql` before commit. It is a proposal, not part of the deployable migration chain; the local focused tests explicitly load it. This reduces accidental migration discovery but does not prove all external integrations are safe. After the move the focused 11 tests passed; the full suite is rerun for the final proposed layout below.

**VERIFIED (ran it):** With SQL in the proposal directory, the final full coverage run passed 371 tests / 73 files; lint/typecheck/build and `git diff --check` passed (2 existing lint warnings). The proposal is not included in the standard fresh migration chain, and the dedicated PGlite test loads it separately. No independent PostgreSQL sessions were tested.

## Local privacy preference SQL proposal

**VERIFIED (ran it):** New test `lib/tsrg/feed-privacy.integration.test.ts` initially failed setup because the proposal file did not exist. After creating the local-only proposal `supabase/proposals/0013_feed_privacy.sql`, 6 PGlite tests passed: default off, enable and per-account read, disable/clear, stale off reads, input validation, and local role privileges. This does not establish real RLS, independent concurrent sessions, or application behavior. `supabase/rollbacks/0013_feed_privacy.sql` is intentionally instructions only; a data-destructive rollback has not been authorized or implemented.

Full `CI=1 npx vitest run --coverage`: 377 tests / 74 files passed; aggregate coverage for included JS/TS files 60.55% statements / 53.81% branches / 56.91% functions / 61.55% lines, not SQL or whole-repository coverage. `npm run lint` including typecheck and `npm run build` passed; 0 lint errors / 2 existing warnings. `git diff --check` passed.

**UNVERIFIED / not implemented:** UI, authenticated route, actual consent, mapping of Firebase identities, integration with feed/events/analytics, clearing other stored copies, stale-event epochs, real database locks, effective real-world access and backups. The service-role can bypass these proposed functions, and the SQL alone cannot enforce opt-out across all app paths. The earlier desired complete privacy feature is still incomplete. No migration was applied and no live data was changed.

## Local queued-interest invalidation

**VERIFIED (ran it):** Extended the local-only privacy SQL proposal with an account interest epoch, invalidated on clear, disable and re-enable transition. A cooperating writer presenting an old epoch is rejected even after re-enable. Repeated enable does not invalidate the current epoch. Two new local PGlite tests passed; the full suite passed **379 tests / 74 files** with coverage for included JS/TS files **60.55% statements / 53.81% branches / 56.91% functions / 61.55% lines**, not SQL or whole-repository coverage. Lint, typecheck and build passed, with 0 lint errors and 2 existing warnings; `git diff --check` passed.

**UNVERIFIED / incomplete:** This is an unwired database proposal, not working end-to-end privacy. An authenticated, trusted producer must capture the epoch at collection, carry it through the queue and submit it with the event. Real concurrent transactions, effective real RLS, all writers, legacy/local analytics, cache clearing, backups and account identity need verification. The epoch does not prevent direct service-role writes or stop tracking elsewhere; result data already returned cannot be recalled. No SQL was applied live.

**VERIFIED by prior metadata inspection / unresolved:** The feed queries `user_follows` with a Firebase subject while live Supabase has UUID-based `follows`; changing only the table name would not resolve identity safely. No route compatibility change was made without a verified identity mapping and integration plan.
