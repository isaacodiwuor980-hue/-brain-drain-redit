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

## Identity-scoped Following v2 endpoint

**VERIFIED (ran it):** Added `/api/feed/following-v2`, independently gated by the server flag `following_feed_v2`, authenticated and restricted to mapped UUIDs, following the inspected live `follows` column names. It is not wired into the browser, and missing/disabled flags do not activate it. Seven mocked HTTP tests cover the disabled/unavailable flag, authentication/mapping, account isolation, no shared cache, missing live `tags` column, malformed IDs, large follow graphs and invalid pagination. Existing feed tests pass unchanged except updating an auth mock to include the new route's dependency. The first targeted tests failed before implementation, then passed; initial lint found three unnecessary escapes in the new test and was fixed before rerunning all checks.

Full coverage run after the fix: **386 tests / 75 files passed**, included-file JS/TS coverage **60.82% statements / 54.13% branches / 57.16% functions / 61.72% lines**; this is not SQL or whole-repository coverage. Lint/typecheck and build passed, 0 errors / 2 existing warnings; `git diff --check` passed.

**UNVERIFIED / blockers:** HTTP tests mock authentication and DB. The service-role query, relation embedding, real two-account security, post visibility, follow mutations, mapped client reactions, row-limit behavior, pagination under concurrent inserts, performance and real identity provisioning remain unverified. The browser still uses the legacy endpoint; this does not resolve the production feed end-to-end. See `FEED_SUPABASE_PLAN.md`. No flag, migration, data change or deployment was made live.

## Limited proposed feed-interest privacy API

**VERIFIED (ran it):** Added authenticated mapped-identity `GET`, `PUT` and `DELETE /api/feed-privacy`, scoped only to the proposed interest storage, with no-store and an explicit scope header. Enabling requires server-side flag `feed_interest_tracking_v2`; disable and clear deliberately bypass that flag to avoid a kill switch blocking privacy requests. The existing auth-tier IP limiter applies. Eight mocked HTTP tests cover mapping, account ownership, disabled/unavailable flag, invalid requests, off/clear when the flag is off, scoped reads and sanitized storage failure. PGlite tests remain separate; this does not demonstrate an end-to-end database-backed API.

Full `CI=1 npx vitest run --coverage`: **394 tests / 76 files passed**, included-file JS/TS coverage **61.08% statements / 54.23% branches / 57.46% functions / 62.01% lines**; not SQL or whole-repository coverage. `npm run lint` (including typecheck) and build passed, 0 errors / 2 existing warnings, and `git diff --check` passed. The initial test run failed because the route did not yet exist.

**UNVERIFIED / incomplete:** Live schema lacks these tables, mapping, flag and RPCs. No UI, event capture, old analytics/caches/backup clearing, end-to-end opt-out, real concurrency/RLS, or staged deployment is implemented. Enable check is not atomic with the SQL write. Rate limiting uses existing IP logic with weaker per-instance fallback. This endpoint must not be represented to users as a complete privacy feature or enabled in production. No live database writes or deploy occurred.

## Transactional privacy-switch guard (local proposal)

**VERIFIED (ran it):** Added flag-row checks and shared locks within the proposed SQL functions for enabling personalization and reading/writing proposed interests. Disabling and clearing still work while the flag is missing or off. New PGlite tests first demonstrated the missing guards and then passed. Full coverage run: **396 tests / 76 files passed**, included-file JS/TS coverage **61.08% statements / 54.23% branches / 57.46% functions / 62.01% lines** (not SQL or whole-repository coverage). Lint/typecheck/build and `git diff --check` passed; lint has 0 errors and 2 existing warnings.

**UNVERIFIED / incomplete:** PGlite is not a test of independent real PostgreSQL sessions or effective live permissions. Other paths and direct service-role table writes bypass these functions. A request already running can complete before the flag update commits, and previously returned data cannot be recalled. A flag off/on cycle does not invalidate queued interest epochs, so old queued events could be processed on re-enable without further design. Site-wide privacy, event capture, UI, live mappings, migrations and real security/concurrency tests remain incomplete. No live data, flag, or deployment was modified.

## Browser activity control and privacy icon

**VERIFIED (ran it):** The old Settings analytics switch was labeled saved-preference-only and did not control `trackEvent`. Added a shield-marked browser activity control, a separate confirmed clear button and explicit local-only limits. Browser IndexedDB operations now serialize activity writes with preference changes and clearing, return no saved events to analytics consumers when off, invalidate cached analytics and queued epochs on changes, and fail closed when the preference cannot be read. Backend sends check the saved preference/epoch and abort in-flight browser requests on a local change; abort cannot undo a request already received. Missing preferences preserve legacy on behavior; the previously saved `dataCollection: false` is honored. Existing saved history is not deleted by switching off; explicit clearing removes the activity store, not other stores. Off does not suppress followed-topic signals. Cross-tab notification via localStorage is best-effort. `sendBeacon` is replaced with checked asynchronous delivery, so page-close analytics may be lost.

Tests: new fake IndexedDB tests and happy-dom integration tests cover off, clear, cache invalidation, legacy saved-off setting, storage failure, queue handling and a settings control with mocked persistence. An initial complete suite failed one old Settings test because it asserted the previous placeholder copy; it was updated to test the new real control and its limitations. Final `CI=1 npx vitest run --coverage`: **407 tests / 78 files passed**; included JS/TS coverage **63.62% statements / 55.6% branches / 60.65% functions / 64.66% lines**, not SQL or whole-repository coverage. Lint/typecheck/build passed, 0 errors / 2 existing warnings; `git diff --check` passed.

**UNVERIFIED / limitations:** No real-browser/multi-tab tests, account synchronization, server-side consent enforcement, removal of already-sent data, backup deletion, other analytics providers, or full privacy and tracking inventory. The app's existing profile/privacy preference is still not enforced; its UI says so. The proposed database privacy API is not connected to this browser setting. This work alone does not establish production readiness. No live database change or deployment was made.

## Browser activity queue failure and in-flight checks

**VERIFIED (ran it):** Added integration tests for aborting an in-flight browser request on opt-out, not retrying that aborted batch, dropping pending activity if the preference database is inaccessible, and clearing the queue when a storage-clear notification is received. Two new regression tests initially failed: an inaccessible preference database caused a queued batch to be retained and later transmitted after a new database appeared; and a cross-tab storage-clear event was ignored. Changed the queue to drop pending batches when preference storage cannot be checked, and handle the storage-clear notification. The Settings local-data clear action also signals the current tab before and after the IndexedDB wipe. These are simulated browser/IndexedDB tests, not independent browser processes.

Final `CI=1 npx vitest run --coverage`: **410 tests / 78 files passed**. Included JS/TS coverage **63.72% statements / 55.63% branches / 60.78% functions / 64.7% lines**, not SQL or whole-repository coverage. `npm run lint` (including typecheck), build and `git diff --check` passed; 0 errors / 2 existing warnings.

**UNVERIFIED / limitations:** Cancellation cannot retract data already received by a server. Cross-tab notification depends on browser storage events, and storage resets and racing old browser tabs still require independent real-browser testing. No account-wide consent, deletion of already-sent/cloud/backup data, or guarantee for other analytics services is provided. Production readiness requires the previously listed identity, schema, security, privacy and rollout work. No live writes, flags or deployment were performed.

## Isolated real PostgreSQL and Chromium privacy checks

**VERIFIED (ran it):** Built a local synthetic PostgreSQL 17.12 cluster in ignored `.cache`, TCP disabled and a user-only Unix socket. A dedicated randomly named database was created and dropped by `scripts/test/privacy-postgres-concurrency.mjs`, which refuses an unexpected data directory or TCP listener. It observed 50 independent waiting writers behind opt-out, then 50 behind clear; after each commit all old-epoch writes were rejected. It also tested one writer blocked by flag-off and basic table/function permission denial for `authenticated`. Ran the script twice successfully. This checks the proposed SQL on PostgreSQL, not actual Supabase, production RLS or the entire application.

**VERIFIED (ran it):** With a local Vite test fixture and headless Chromium 143, `scripts/test/privacy-browser.mjs` passed twice with two tabs: one tab switches off while the other has queued synthetic activity, cross-tab notification arrives, new events are not persisted/used and pending events are not sent; the local clear case also passes. All external browser requests were blocked and `/api/events` intercepted. It exercises the actual browser modules, not Settings UI, a real backend, multiple devices, other browsers, or deletion of data already sent. Initial Chromium startup failed because NSS/NSPR system libraries were absent. Temporary source builds provided the needed shared libraries; the full NSS tool build failed for missing zlib headers, but Chromium itself then ran. Both local test processes were stopped.

Added exact dev dependencies `pg@8.16.3` and `playwright-core@1.57.0`, manual test scripts/fixture and `PRIVACY_ISOLATED_TESTS.md`; they are not automatically run in CI. Added `.cache` to Git/ESLint ignores after the first lint run accidentally scanned temporary third-party sources (76 errors in those files, not app code). Final full `CI=1 npx vitest run --coverage`: **410 tests / 78 files passed**, included JS/TS coverage **63.72% statements / 55.63% branches / 60.78% functions / 64.7% lines**, not SQL or entire repo. Lint/typecheck/build and `git diff --check` passed, 0 errors / 2 existing warnings.

**UNVERIFIED / blockers:** Cloud analytics ownership and deletion, privacy settings UI in real browser, complex multi-tab/storage-reset/in-flight races, real Supabase permissions and RLS, migration compatibility, authenticated mapping, points, feed integration, backup/restore and rollout. Real tests do not prove universal safety. No live data or settings were changed; draft PR remains unready to merge or deploy.

## Local points reservation ledger proposal

**VERIFIED (ran it):** Added a local-only SQL proposal and six PGlite tests. It creates a single 1,000-point noncash wallet, uses an append-only event table and serialized reserve/release functions with request replay checking, and disallows ordinary service-role direct table writes. Tests verify initialization, balances, duplicate/reused keys, account isolation, insufficient points, invalid inputs and basic privilege checks. The initial test run failed because the proposal file was absent; it was not a behavioral regression of deployed code. Rollback is deliberately comments only because dropping accounting data would be destructive.

On a temporary socket-only PostgreSQL 17.12 cluster with synthetic accounts, `scripts/test/points-postgres-concurrency.mjs` passed twice: 50 parallel opens yielded one grant, 50 competing 100-point reservations yielded 10 successes / 40 insufficient-balance rejections, and 50 duplicate reserve requests and 50 duplicate release requests produced one mutation each. The temporary database was dropped and the server stopped. The manual test is not part of CI.

Full `CI=1 npx vitest run --coverage`: **416 tests / 79 files passed**, included-file JS/TS coverage **63.72% statements / 55.63% branches / 60.78% functions / 64.7% lines**, not SQL or entire-repo coverage. Lint/typecheck/build and `git diff --check` passed, 0 errors / 2 existing warnings.

**UNVERIFIED / incomplete:** No burn/slashing, pricing, eligibility, UI, identity/authenticated API, flag or atomic vote coupling exists. Privileged owners can bypass controls; delete/retention rules are unresolved because restrictive FKs deliberately block account/post deletion. PGlite and isolated PostgreSQL are not actual Supabase/RLS or a full concurrency proof. The proposal is not deployed or connected; no live data or settings changed. See `FEED_SUPABASE_PLAN.md` for full gates.

## Restrict outbound activity URL data

**VERIFIED (ran it):** A new regression test demonstrated that `page_view` payloads could send the browser query string and full referrer even though the event route was stripped of query parameters. Updated the client-side backend payload sanitizer to omit `search` and `referrer`, replace raw `query` with length only, and strip query/hash from `path`. The regression now passes. This changes outbound telemetry, not local recommendation inputs; legacy local event records still contain their existing fields.

Full `CI=1 npx vitest run --coverage`: **417 tests / 79 files passed**, included JS/TS coverage **63.9% statements / 56% branches / 60.78% functions / 64.86% lines**, not SQL or entire-repository coverage. Lint/typecheck/build and `git diff --check` passed; 0 errors / 2 existing warnings.

**UNVERIFIED / limitation:** This client-side filter is not a server-side security boundary: old clients or direct callers can still send arbitrary payloads. Other field names, paths, arrays, older stored activity, server logs, third-party services and account-wide deletion require a separate inventory and enforcement. No database or live deployment was changed. Updated `FEED_DESIGN.md` to reflect the later successful read-only schema inspection and local-only ledger proposal.

## Deferred stake pricing and server-side activity filtering

**USER DECISION:** Stake pricing was explicitly deferred. Keep staking disabled and do not choose tier amounts or connect it to voting until that decision is made; the local ledger remains a prototype.

**VERIFIED (ran it):** Added mocked HTTP tests that demonstrated older/direct clients could submit raw route queries, search/referrer/query fields and URL query fragments in path fields. The server now strips those specified fields and route/path query fragments before passing events to storage, regardless of client behavior. Analytics storage and route errors no longer log upstream error objects that may contain event payloads. Three new HTTP tests passed after the initially failing regression. Full `CI=1 npx vitest run --coverage`: **420 tests / 80 files passed**, included JS/TS coverage **64.15% statements / 56.18% branches / 61.04% functions / 65.17% lines**, not SQL or entire-repository coverage. Lint/typecheck/build and `git diff --check` passed, 0 errors / 2 existing warnings.

**UNVERIFIED / limitations:** This is targeted filtering, not a full PII scrubber: arbitrary other strings, paths, arrays and identifiers may still include sensitive data. Old stored events, logs, server/cloud backups and third-party sources are not deleted, and server-side ownership/deletion, retention and consent are unimplemented. Tests mock storage and do not prove real database behavior. No live changes or deployments were performed.

### Production-readiness follow safety
- VERIFIED: the mocked HTTP regression failed before the change because missing follow storage returned 204. The route now returns 503 without exposing upstream details; another upstream error remains 502. The focused two-test run and full 422-test / 81-file coverage run passed. Lint/typecheck/build passed with two existing lint warnings. Commit `94fac8d`; no live writes or deployment.
- UNVERIFIED: follow functionality on the live schema; the application's legacy `user_follows` does not match observed `follows`. Identity provisioning and real RLS/concurrent-writer validation remain blockers. See `PRE_PRODUCTION_CHECKLIST.md`.

### TSRG offline scoring validation
- VERIFIED: two new regression cases failed before the fix: missing required ranking weights and arithmetic overflow returned invalid scores instead of rejecting them. The offline scorer now rejects missing weights and non-finite computed scores; ordinary scoring weights and live feed behavior are unchanged.
- VERIFIED: focused tests passed; coverage run 424 tests in 82 files, 62.25% statements / 55.01% branches / 59.46% functions / 63.05% lines in configured scope. Lint and typecheck passed with two existing warnings; build passed.
- UNVERIFIED: real-world ranking quality, fairness, trusted signal provenance, live data/RLS, and production operation. This does not authorize or enable deployment.

### Initial 20,000-user synthetic TSRG benchmark
- VERIFIED: added a reproducible local-only sequential simulation of 20,000 artificial feed requests, each 80 candidates and 10 output slots. Zero ranking errors in that run; 200,000 slots. Matched synthetic groups received 109,936 vs 90,064 exposures: a fairness warning requiring investigation. See `TSRG_SYNTHETIC_STRESS_REPORT.md` for scope, metrics and limitations.
- VERIFIED: 426 tests / 83 files passed, coverage in configured scope 62.69% statements / 55.26% branches / 59.82% functions / 63.31% lines; lint/typecheck/build passed with two existing warnings. No live writes or deployment.
- UNVERIFIED: live concurrency, service reliability, fairness for real people, real post quality or factual accuracy, expert detection and competitor comparisons. The benchmark uses synthetic fixture scores and does not approve production settings.

### Offline tie-break regression
- VERIFIED: a new 2,000-user matched-fixture regression failed with a 9.93% exposure gap relative to total slots; mixing the hash bits reduced the imbalance in this fixture. The focused regression passed. A fresh 20,000-user run produced 100,107 vs 99,893 exposures and zero ranking errors. The tie-break change is offline only, deterministic and does not establish general fairness.
- VERIFIED: 427 tests / 84 files passed, coverage 62.72% statements / 55.26% branches / 59.82% functions / 63.36% lines in configured scope; lint/typecheck/build passed with two existing warnings. See `TSRG_SYNTHETIC_STRESS_REPORT.md`; no live writes or deployment.

### Disposable write/delete lifecycle checks
- VERIFIED: new PGlite tests exercised 240 synthetic reaction toggles over three test accounts and posts, comparing every response and stored state to an independent model; creation, removal and switching all occurred. Also tested transaction rollback, rejected unknown identities/missing posts and function privilege metadata. These sequential tests are not real-user, real-RLS or concurrency verification.
- VERIFIED: in the local-only points ledger proposal, deleting an account with an opened wallet and deleting a post with a released reservation both fail with restrict violations. This is a known design blocker, not a live database observation or a resolved privacy policy. No deletion/retention policy was silently chosen.
- VERIFIED: all 433 tests across 86 files passed; coverage 62.72% statements / 55.26% branches / 59.82% functions / 63.36% lines in the configured scope; lint/typecheck/build passed with two existing warnings. No scoring behavior, live database or deployment changed.

### Proposed account points erasure (local only)
- User selected removal of identifiable points history on account deletion. VERIFIED: before implementation, the new synthetic PGlite test failed because the erasure function did not exist. Added review-only proposal `0015_points_account_erasure.sql` and rollback file; focused tests pass for synthetic isolation, same-transaction account deletion, rollback, and permission metadata. The existing append-only and deletion-blocker tests also pass independently.
- VERIFIED: 436 tests / 87 files passed; coverage 62.72% statements / 55.26% branches / 59.82% functions / 63.36% lines in configured scope; lint/typecheck/build passed with two existing warnings. No live writes or deployment.
- UNVERIFIED: concurrent account deletion against wallet creation/reservation on real PostgreSQL, authenticated API ownership, full account deletion, real Supabase grants/RLS, post deletion, backups and derived data. The trusted caller must erase points and delete the auth account in the same transaction. This proposal alone is not an account-deletion feature and must not be deployed as-is. The rollback has not been executed and cannot restore deleted data.

### Offline explicit-tier aggregation and Wilson edge case
- VERIFIED: added unwired V3 aggregation of explicit vote direction, tier and supplied tag-specific authority using existing fixed-point and Wilson helpers. It rejects duplicate voters, mismatched tag labels and invalid data; it does not verify provenance, eligibility, or infer legacy tier choices. No legacy score changed and no points or production feed was connected.
- VERIFIED: focused tests exposed a low-mass monotonicity issue in the existing Wilson formula: up mass 0.35 alone scores ~0.0539, but adding down mass 1.95 scores ~0.1065. A down-only example can score above zero. Added a test that documents current behavior; this remains a release blocker, not a fix. No claim of a statistically calibrated truth probability.
- VERIFIED: 440 tests across 88 files pass; coverage 62.87% statements / 55.61% branches / 59.87% functions / 63.52% lines in configured scope; lint/typecheck/build pass with two existing warnings. No live writes or deployment.

### Additive Wilson-prior comparison
- VERIFIED: new offline `wilsonPriorCandidateV3` consistently includes the existing symmetric prior in both the proportion and sample size. This deliberately differs from the legacy score, which remains unchanged and is not replaced in any caller. The initial test failed because the new module did not exist; the focused tests now pass.
- VERIFIED: in 10,000 deterministic nonempty synthetic pairs, the candidate remained bounded and moved in the expected direction when adding either vote mass (floating tolerance). It fixes the specifically observed low-mass direction example but retains a cold-start discontinuity: zero votes score zero and the first down-only mass yields a positive score. A synthetic 1% Life vs 99% minimum-mass Mouth scenario still favors the majority. No real expertise or ground truth was verified.
- VERIFIED: 445 tests across 89 files passed; coverage 62.98% statements / 55.70% branches / 59.92% functions / 63.63% lines in configured scope; lint/typecheck/build passed with two existing warnings. No live writes, flags or deployment.

### Synthetic answer-key comparison
- VERIFIED: ran `scripts/test/tsrg-answer-key-simulation.ts` on 20,000 synthetic binary questions in four assumed scenarios. In the scenario where one expert is 99% correct and 99 others are 10% correct, both Wilson orientation comparisons and binary majority were wrong on 5,000/5,000 questions. Four-voter and expert-wrong cases are reported in `TSRG_ANSWER_KEY_SIMULATION.md`. These are not real users, real truth, deployed feed decisions or statistically calibrated probabilities.
- VERIFIED: 447 tests in 90 files passed; coverage 63.33% statements / 56.17% branches / 60.22% functions / 63.95% lines in configured scope; lint/typecheck/build passed with two existing warnings. No algorithm behavior, live data or flags changed.

### Offline reviewed-answer summary
- VERIFIED: added a separate, unwired per-topic synthetic answer-summary experiment. It accepts mixed two-to-eight option questions, reports supplied-key matches and uniform-guess baseline, rejects duplicate question IDs, mismatched topic and invalid choices, and returns no result without observations. The initial test failed because the new module did not exist, then focused tests passed.
- VERIFIED: a 10,000-question deterministic synthetic uniform-guess fixture falls near its 25% baseline. Identical correct response data from genuine knowledge versus leaked answers yields identical output; the experiment cannot distinguish them. It is not an expertise, calibration-probability, authority or truth gate.
- VERIFIED: 453 tests in 91 files passed; coverage 63.49% statements / 56.58% branches / 60.32% functions / 64.08% lines in configured scope; lint/typecheck/build passed with two existing warnings. No existing engine behavior, live data or feature flags changed.

### Offline interest underflow comparison
- VERIFIED: a regression showed V3 returned 1 instead of 0.75 for an extremely tiny positive observation with an equally tiny prior due to subnormal underflow. Added unwired `interestFromExposuresV4` without changing V3. Positive/negative subnormal cases, negligible evidence, duplicates and 500 ordinary comparisons passed. This extreme numeric example is not evidence of a real user impact.
- VERIFIED: 455 tests in 92 files passed, coverage 63.67% statements / 56.88% branches / 60.42% functions / 64.28% lines in configured scope; lint/typecheck/build passed with two existing warnings. No live data, scoring flags or existing exports changed.

### Feed gap analysis
- Documented the 70/15/10/5 design gap, existing prototypes, dependencies and release blockers in `FEED_GAP_ANALYSIS.md`. No feed implementation, live writes or deployment.

### Offline personalization composition
- VERIFIED: added a separate, unwired prototype combining supplied topic interest and a supplied quality proxy with an explicit experiment weight. No production weights, score meaning or existing route changed. The new tests failed before implementation because the module did not exist; focused tests pass for interest ordering, neutral cold start, shuffled candidates, invalid configuration, and no interest-map access with personalization off. This does not establish backend privacy or deletion.
- VERIFIED: 459 tests in 93 files passed; coverage 63.78% statements / 57.16% branches / 60.51% functions / 64.38% lines in configured scope; lint/typecheck/build passed with two existing warnings. No live writes or deployment.

### Synthetic personalization comparison
- VERIFIED: local `personalization-synthetic.ts` ran 20,001 sequential synthetic feed requests split equally into warm, cold and personalization-off groups, with no invalid outputs. Warm feeds selected all four available preferred-topic posts; cold/off averaged about 4.93 distinct topics in 10 slots, warm about 4.51. This is a fixture outcome, not real quality or privacy proof; no topic cap or exploration quota is implemented. See `TSRG_PERSONALIZATION_SIMULATION.md`.
- VERIFIED: 460 tests in 94 files passed; coverage 63.90% statements / 57.36% branches / 60.76% functions / 64.52% lines in configured scope; lint/typecheck/build passed with two existing warnings. No live writes or deployment.

### Synthetic soft-diversity comparison
- VERIFIED: applied the existing offline best-effort diversity helper to the same 20,001 synthetic requests. In that fixture warm preferred-topic slots went from 26,668 to 20,001 and mean topics/page from 4.51 to 4.83. This was a test configuration, not an approved production cap, a 70/15/10/5 implementation, a fairness guarantee or real user satisfaction. See `TSRG_PERSONALIZATION_SIMULATION.md`.
- VERIFIED: 461 tests in 95 files passed; coverage 63.96% statements / 57.36% branches / 60.90% functions / 64.56% lines in configured scope; lint/typecheck/build passed with two existing warnings. No live data or feed changed.

### Privacy proposal write-grant hardening
- VERIFIED: synthetic PGlite tests exposed that the local 0013 proposal granted service_role direct INSERT/UPDATE/DELETE, allowing a service client to insert interest after opt-out without the RPC's epoch/flag checks. Both new checks failed before the change. Added review-only proposal 0016 to revoke explicit direct mutation grants while retaining read and RPC access, plus a rollback warning. Focused tests now pass using a synthetic BYPASSRLS service role, including disable, stale write rejection and direct write denial.
- VERIFIED: 463 tests in 96 files passed; coverage 63.96% statements / 57.36% branches / 60.90% functions / 64.56% lines in configured scope; lint/typecheck/build passed with two existing warnings. No live database change or deployment.
- UNVERIFIED: real Supabase permissions, role ownership/inheritance/column privileges, concurrency and full privacy lifecycle. A compromised service can still call the RPCs with arbitrary UUIDs; trusted API ownership remains essential. Retained direct SELECT and non-cooperating writers need further review. The rollback was not executed and restoring broad DML permits bypass.

### Offline identity planning
- VERIFIED: added a pure aggregate-only planning experiment for assumed-reviewed identity pairs; it checks syntax, one-to-one snapshots, duplicates, missing users and conflicts, and returns no identifiers or writable plan. New synthetic tests initially failed because the module did not exist. An additional regression exposed that a malformed row could hide a duplicate UUID; the experiment now quarantines valid identifiers also present in malformed rows. Focused tests pass.
- VERIFIED: 467 tests in 97 files passed; coverage 64.30% statements / 57.96% branches / 61.00% functions / 64.85% lines in configured scope; lint/typecheck/build passed with two existing warnings. No real identity records or live data were read or changed by this helper.
- UNVERIFIED: ownership proof, authenticating both accounts, real snapshots, concurrency and a secure provisioning/recovery process; the experiment is not an identity-linking tool and must not be used to populate mappings.
