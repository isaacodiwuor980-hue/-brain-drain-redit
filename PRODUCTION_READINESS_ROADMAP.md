# Brain Drain production-readiness roadmap

Status: **not cleared for production**. This is an execution and evidence plan, not a promise of a launch date. The current branch includes experimental, unverified functionality. Local unit, PGlite and mocked HTTP tests do not prove security, durability, real-device behavior, or deployment state. Do not deploy the branch to real users until the release gates below are met and the operator explicitly approves.

## Principles and release gates

- Preserve existing data and user journeys; do not discard uncommitted work or destructively modify a database without authorization, a verified backup/restore procedure, and a reviewed migration/rollback plan.
- Use isolated staging with disposable accounts; do not run load or destructive tests on production. Never put credentials, full identifiers, personal data or tokens in logs, artifacts or chat.
- A task is **done** only when its acceptance evidence and outstanding limitations are recorded. A local pass is not a staging or production pass. Existing functionality stays available unless a necessary behavior change is explicitly documented and reviewed.
- Keep stake, automatic penalties, slashing, corpus access and experimental TSRG deployment disabled until separately justified and authorized. No signal should be marketed as proof of truth.
- Record target, commands, sanitized results, failures, owner, rollback and approvals in a staging verification report. Use `NEXT_SESSION_STAGING_CHECKLIST.md` as a starting point, updating the plan through review if repository state changes.

## P0 — Must be resolved before any production deployment

### 1. Environment, inventory, backup and migration safety — BLOCKED on operator/staging

1. Identify the actual production and isolated staging projects, deployed code and database migration histories; verify project separation and access without disclosing credentials.
2. Inventory schemas, extensions, RLS, policies, privileges, triggers, indexes and existing data; perform a verified backup and restoration exercise for each affected database. Define explicit deployment and rollback ownership.
3. Review `supabase/migrations/0001`–`0009` in dependency order. `0002` requests pgvector and uses the same nested `$$` delimiter; `0004` has a `now()` partial-index predicate. Determine actual behavior on a disposable PostgreSQL/Supabase instance, and design separately reviewed corrections without rewriting possibly applied migration history. `IF NOT EXISTS` does not repair mismatched existing objects.
4. Apply only reviewed, authorized, unapplied migrations on staging; record before/after state and stop on failure. Never assume 0005 is absent or present in a live project.

**Acceptance:** approved migration sequence, verified restore and rollback, sanitized per-migration staging results, no unexplained schema differences. Owner: operator plus engineering reviewer.

### 2. Identity mapping and ownership — OPEN; staging and provisioning design required

1. Design audited one-to-one Firebase-subject → Supabase `auth.users.id` provisioning, lifecycle, recovery, deletion and conflict handling; never infer mappings from email. Establish ownership of existing accounts and an unmapped-user support path.
2. `api-server/src/routes/brains.ts` now resolves verified mappings for brain saves, private lists, private reads and deletes. This is a deliberate fail-closed behavior change: missing mappings deny private access and saves, while public reads remain available. Deploy only after migration 0007, audited provisioning and staging coverage; missing 0005 still makes saves fail closed. Other routes remain unmigrated.
3. Audit every service-role route using direct Firebase subjects, including posts, feed, topics, onboarding, personality, experts, mentors and recall. Resolve ownership semantics rather than applying a blanket mapping blindly; keep intentional public reads intact.
4. Test unauthenticated, mapped, unmapped, expired, malformed, two-user isolation, DB outage, account switching and cross-tenant cases at HTTP and real staging layers. No identifier, token or full email in logs.

**Acceptance:** documented mapping coverage and recovery, verified staging owner isolation across API and DB, no client-supplied identity trusted as authority, reviewed rollout and backout. Mock-only tests are insufficient.

### 3. RLS and privileged API authorization — OPEN; real Supabase required

- Map every table, view, RPC and API route to an intended access contract. `0002` creates `skills` without enabling RLS in that migration; `0003` adds hashes to profiles that `0001` makes publicly readable. Verify effective grants, view privileges, direct query access and privacy of exposed columns.
- Test anon, two distinct non-owner authenticated users, service_role, table ownership and role inheritance. For private data ensure User B cannot read or mutate User A's data; public records follow the explicitly approved public contract.
- The API's service-role client bypasses RLS by design. Verify authorization at each endpoint and do not expose the service-role key to browser bundles. Revoke unintended grants and add reviewed corrective migrations as needed, after backup and staging review.

**Acceptance:** per-table/function/endpoint evidence with two-user negative tests, privileged-route adversarial tests, and no unresolved critical/high isolation findings.

### 4. Durable brain saves and synchronization — PARTIAL

- Validate `0005` against actual schema and mapped identities; test independent concurrent writes, conflicting node IDs, topology validation, rollback, permission errors and restore. Do not deploy API independently of its reviewed database dependencies.
- Add durable retry and account-scoped pending operations, version/conflict resolution, cross-tab behavior, deletion tombstones and reconciliation. Prevent stale cloud responses from overwriting newer local edits or resurrecting deleted content.
- Audit all authoritative IndexedDB write paths for swallowed errors, partial transactions and user-visible failure feedback. Test import/export, offline edits, crashes, quota failures and two-device recovery.

**Acceptance:** no lost/overwritten cross-user data in adversarial staging tests; repeatable offline-to-online recovery and explicit conflict behavior; tested backup/restore and rollback.

### 5. Privacy, account export and deletion — PARTIAL; legal/ops decision required

- `pages/SettingsPage.tsx` now labels its existing browser-only export and local wipe accurately, warns about unsynced data, and uses strict reads/clears. This is **not** a complete account export or account deletion service; local data may contain multiple accounts and selected stores omit other local and cloud data.
- Inventory Firebase Auth, Firestore, Supabase, IndexedDB, local/session storage, logs, backups and third parties; define ownership, data retention, consent, export scope, deletion propagation, legal holds and restoration behavior.
- Implement authenticated, account-scoped export with an explicit manifest and partial-failure handling. Implement a protected deletion request workflow, dry-run/impact inventory and explicit confirmation; only implement real deletion after verified backups, legal review and explicit approval. Support applicable in-app and external request paths.
- Review `public/privacy-policy.html` and `public/terms-of-service.html` against actual implementation and applicable law with qualified counsel. Existing claims about deletion, retention, analytics and privacy are not verified. Confirm working contact channels; do not assert legal compliance based on code alone.
- Settings now warns that the privacy, push and analytics switches store local preferences only and are not enforcement controls. Implement and test actual server-side privacy and consent behavior before relying on those switches; warning text does not enforce a preference.

**Acceptance:** authenticated cross-service export and deletion tested for two users and failure/retry/restore scenarios; reviewed policy and retention implementation; verified user-facing descriptions; jurisdiction-specific review complete.

### 6. Reactions and experimental ranking — PARTIAL; do not enable

- Preserve ordinary reaction toggles and default/Following feed. The current reaction route uses multiple writes and has not been validated under independent concurrency.
- `0006` adds `reactions.tier`; `0007` adds `reaction_tier_source`. Legacy defaults are not explicit stake choices. Decide intended tier semantics before backfill or UI. `0008` is an unwired desired-state setter, not the toggle route; `0009` previews the setter only and provides a null concurrency token.
- Design safe preview/isolated shadow comparison with captured pre-write state, explicit removal semantics, ordering/version strategy, realistic concurrency and a meaningful divergence denominator. Never call a mutating RPC as a live shadow. A same-state hash or creation timestamp alone cannot detect A→B→A.
- The `GET /api/tsrg/status` check is a soft switch for cooperating online clients; old/offline clients and polling delays limit it. Define offline/version rollout and ensure the default feed stays independent. Retain explicit staging identity-coverage and seven-day meaningful shadow criteria before proposing a replacement, subject to review.

**Acceptance:** reviewed behavior and privacy model, staged concurrent-writer and role tests, representative shadow evidence without live writes, fail-closed rollout/backout, no unsubstantiated accuracy claims.

## P1 — Required before a public launch

### 7. Product functionality and data integrity

- Complete the requested topics-to-circles transition without data loss: inventory schemas, clients, links, followers, feeds and analytics; design additive migration, compatibility redirects, backfill, verification and rollback before retiring old names.
- Verify post/comment creation, attachments, moderation, reports, notifications, search, following, branches, pathways and collaboration end-to-end. Mark local-only experiences honestly; do not present seeded or static examples as live data. A real-time circle room requires an authorized backend, access controls, media permissions and recording consent.
- Review file uploads against server-side validation, size/type enforcement, safe storage and abuse controls. Client validation alone is insufficient.

**Acceptance:** documented product contracts; authenticated and guest end-to-end journeys, cross-device persistence, abuse tests and recovery checks on staging with representative non-production data.

### 8. Security, observability and operations

- Threat-model auth, service-role boundaries, data import, HTML rendering, SSR, CSP, cross-origin access, CSRF, rate limits and secret handling. Verify CSP against real deployment paths and browser behavior. Resolve material findings; review Firestore rules in emulator and staging before deployment.
- Review `npm audit`, dependency advisories, tooling warnings, logging/redaction, request IDs and alerting. Validate TLS, backups, restore, incident response, observability and least-privilege key rotation.
- Establish deployment environments, CI, reproducible build, versioned migrations, canary/release rollback, change approvals and incident ownership. Avoid implying that a monitoring endpoint establishes readiness.

**Acceptance:** reviewed security and operational checklist, no unresolved release-blocking findings, restore drill, alert/routing tests and documented rollback rehearsal.

### 9. Accessibility, devices and user validation

- Run keyboard, screen-reader and contrast checks against actual screens; verify navigation, dialogs, forms, errors, focus and touch targets on real Android devices and representative viewports. Verify browser storage denial, offline/online transitions and service-worker upgrades.
- Conduct small consented usability tests using disposable accounts. Record measured findings and fix release blockers; do not fabricate user or traffic counts.

**Acceptance:** documented device/browser matrix, accessibility findings resolved or formally accepted, representative user journeys and recovery tests passing.

## P2 — After the P0/P1 gates and separate approval

- Consider phased TSRG authority, evidence, moderation and recommendation experiments only with trusted server-side inputs, a reviewed threat model, privacy/appeal design, measurable outcomes and explicit enablement/rollback criteria. Never equate engagement or a score with truth.
- Consider data licensing or corpus products only after user rights, consent, ownership, retention, security and legal review. No assumed commercial readiness, pricing or dataset availability.
- Evaluate performance with realistic, bounded staging workloads and documented baselines; increase only with operator approval. Never simulate or claim real users or agents that do not exist.

## Execution order and current next action

1. **Local now:** maintain the roadmap and fix verified local safety defects with tests. Browser data labels/export error handling were updated in this iteration; cloud account deletion and policy enforcement remain open.
2. **Operator:** authorize isolated staging, secure configuration, disposable test identities and a verified backup/restore plan. No secrets in chat.
3. **Engineering:** finish migration/identity design and conduct staged RLS, authorization, concurrency, sync and device checks. Stop on unexpected state; propose reviewed fixes rather than modifying applied migrations.
4. **Product, operations and legal:** close decisions, review real user-facing claims, complete privacy and operational sign-offs.
5. **Release decision:** an accountable owner reviews the evidence and authorizes a staged rollout; staging success alone is not production clearance.

Working evidence and historical scope: `PHASE_1_CLOSURE.md`, `NEXT_SESSION_STAGING_CHECKLIST.md`, `ENGINEERING_AUDIT.md`, `IMPROVEMENT_BACKLOG.md`, `DECISIONS_NEEDED.md` and `RUNBOOK.md`. Historical closure notes describe the state at that commit and do not override later changes.

## Latest local verification

The roadmap/local-data iteration passed 235 tests in 46 files, TypeScript typecheck and build. ESLint reported 0 errors and the same 2 pre-existing warnings. New fake-IndexedDB and happy-dom tests cover selected-store export, read failures, disposable-store clearing, cancellation and error feedback. No real user data, staging database, production database, migrations, deployment or real device was touched. The privacy/terms content and cloud account lifecycle are not fixed by these local UI changes.


## Brain identity integration — local follow-up

Brain protected operations now resolve the Firebase subject through `user_identity_map` and use its UUID for ownership checks and the 0005 RPC. Unknown/malformed mappings fail closed (403 for writes/private list, 404 for private detail); lookup errors return 503. Public detail and public lists do not require a mapping. This deliberately changes previous behavior: unmapped users cannot use private cloud-brain operations, so do not deploy before verified provisioning, 0005/0007 compatibility and a reviewed rollout/rollback. Existing `api-server/src/routes/brains.http.test.ts` was updated intentionally: its former expectation that raw Firebase `user-1` reached `p_uid` is replaced by the mapped UUID assertion; `api-server/src/routes/brains.identity.http.test.ts` covers mocked multi-user cases. This is not evidence of real Supabase or concurrent-writer behavior.

Latest brain-identity and settings-warning follow-up: 242 tests in 47 files passed; typecheck/build passed; ESLint reported 0 errors and 2 existing warnings. Brain isolation tests use mocked auth/database, not real Supabase. Settings preference warnings do not implement privacy or analytics controls. No migration, staging database, production system or real-user account was changed.

## Skill search and ownership local follow-up

The public service-role skill search previously did not constrain `status`, so private and in-review records could be returned. The local route now requests published records only and filters returned rows defensively; mocked HTTP tests cover each search layer. This does not fix direct database grants or demonstrate the deployed schema's RLS.

The skill upsert previously used an unrestricted service-role merge on a client-supplied ID; the local code now inserts without merging and, on conflict, uses a single ID-and-owner-conditioned PATCH that checks returned IDs. Skill delete now includes the owner in the final DELETE and checks whether a row was actually removed. These changes have mocked route and request-construction tests, not real multi-session/PostgREST verification. They intentionally reject some malformed IDs and ownership conflicts. The routes still use the Firebase subject as `author_id`; a reviewed identity model and staging tests remain required. Migration `0002` as written does not create the `author_id` or `updated_at` columns the route expects, so live schema compatibility is unknown and this is not deployable without review.

A local isolated PGlite check (not staging) reproduced SQLSTATE `42601` parsing migration 0002 after omitting its unavailable pgvector creation, and SQLSTATE `42P17` for the 0004-style `WHERE next_recall_at > now()` partial-index predicate. These reproduce specific blockers but do not test the full migration chain or prove Supabase behavior. Do not edit possibly applied migrations in place or apply a workaround without a reviewed migration/backup plan.

Local verification after this follow-up: 255 tests in 50 files passed; typecheck and build passed; ESLint reported 0 errors and 2 existing warnings. No staging, production or real-user data was touched. Skill ownership and privacy still require real-schema, identity and multi-user verification.

## Public skill list follow-up

The public skill list already requested `status=published`; it now also discards any non-published rows returned by the service-role query. Search no longer advises applying migration 0002 in response to an arbitrary storage error, and the skill list no longer claims every outage means its table is missing. Existing empty-result fallback contracts remain unchanged. Mocked HTTP tests exercise these behaviors; they do not validate database grants, schema or RLS. Latest local gates: 258 tests in 50 files, typecheck and build passed, ESLint 0 errors and 2 existing warnings. Migration and identity blockers above remain open; no live systems were touched.

## Feed, agreement and tagging audit — local follow-up

- **Locally changed:** feed rendering now includes all of the current viewer's reaction types, not just the first (a repost previously could hide an upvote), while keeping other users' reaction identities out of the response. Following pages are no longer placed in the shared feed cache, and failed follow-graph lookups return a controlled 502 without upstream details. Mocked HTTP tests cover cold/shared-cache viewers, guests, following and an outage. This does not verify actual Firebase-to-Supabase identity mapping or database security.
- **Agreement percentage: not implemented or validated.** Product semantics need confirmation: which actions mean agree/disagree, denominator and empty-vote display, whether guest votes count, and whether it is a simple vote share or something else. It must not be presented as truth or accuracy. The existing feed loads reaction rows without pagination or a database aggregate, so a PostgREST row cap may truncate counts; existing multi-step reaction toggles also lack proven concurrency guarantees. A reliable percentage needs reviewed server-side aggregation, vote uniqueness/identity and concurrent-update tests on the actual schema before release.
- **Post tags: partial/local, not cross-device ready.** `feed/PostCreator.tsx` collects tags and `PostCard` can render them, but `lib/api/feed.ts`'s create contract and `api-server/src/routes/posts.ts` do not transmit/store them, `0001_initial_schema.sql` defines no post tags column, and `feed.ts` does not return tags. The title and other local post fields also need a contract inventory. Design a bounded validated tag representation and additive, backup-aware migration after inspecting deployed schema; round-trip through create/feed, offline sync and cross-device tests; plan backfill and rollback. Do not claim tags work across devices until verified.
- **Further feed blockers:** the client `mergeCloudWithLocal` preserves local reactions over cloud results, while local toggle defaults to `me`; cache and account switching, server reconciliation, offline retries, duplicate requests, pagination, follow graph and counts require end-to-end review. Do not blindly change identity handling or wire the experimental reaction RPC/preview into live routes. Topics-to-circles migration still requires data-preserving compatibility and rollback.

Latest local gates: 261 tests across 51 files; typecheck and build passed; ESLint 0 errors and 2 existing warnings. Tests use mocked feed database/auth; no staging or production access, live migrations or real-user tests were performed.

## Product direction: tiered agreement, topic reputation and impressions

The user clarified that agreement is intended to use explicit Mouth/Lunch/House/Life choices (weights 1/2/3/4) on either side, topic-specific reputation and anti-abuse safeguards, not a simple upvote percentage. No UI, live route, stake, automatic penalty, rate cap, impression tracking or ranking was enabled by this clarification. Existing reaction tier defaults cannot be interpreted as explicit historic choices.

**Isolated local prototype:** `lib/tsrg/weighted-agreement.ts` implements the specified weighted-point Wilson-style arithmetic for explicitly supplied votes and a supplied damping factor, and returns no estimate for zero votes. It reproduces 17/27 weighted share and a 44.23% lower bound at B=1. When B<1 the share remains P/(P+F), and only the effective volume is dampened; P/((P+F)*B) can exceed 1. This is not wired into the application, detects no brigades, and accepts inputs without identity verification. The legacy TSRG score uses different parameters and is unchanged. Weighted points are not independent observations: multiplying all weights changes the result, so this lower bound is a heuristic, not a calibrated 95% confidence interval or probability that a claim is true. Determine a statistically justified estimator with actual independent-voter/sample-size and calibration evaluation before any production display.

**Proposed separation:** (1) privately stored declared interests and observed usage improve feed relevance but grant no expertise or voting authority; (2) topic reputation must come from attributable, topic-relevant contributions and reviewed signals, with caps against repetition, self-voting, coordination and tag gaming; (3) user-selected confidence tier is not money or a real-world wager. New users should retain ordinary voting and a fair path to earn topic standing; outsiders are not automatically scammers. Exact eligibility, reputation decay, abuse response, rate caps, correction and appeal are product/security decisions. Do not infer truth, scam or punish a user from consensus; independent moderation/evidence and appeal are prerequisites for any consequential action. No automatic slashing or penalties without separate approval.

**Impressions:** define a countable impression explicitly (for example, rendered and sufficiently visible for a minimum duration in a foreground tab, with per-session deduplication), decide whether to show aggregate impressions or estimated unique viewers, and never label one as the other. Review consent, retention, aggregation, abuse and privacy; account for offline retries, duplicates and concurrent delivery. Exact thresholds need product approval and validation. Avoid recording sensitive browsing histories unnecessarily. No impression implementation is present yet.

**Ranking:** clarify whether “less latency” means lower application response time or faster initial exposure of new posts. Response latency is an operational performance metric, not an individual post's quality. If the intent is early discovery, consider a bounded, time-limited exploration allocation for underexposed new posts, preserving relevance and safety without directly rewarding raw impression volume or allowing refresh gaming. Preserve chronological default and Following feeds until an approved experiment; measure p50/p95 service latency and exposure fairness separately on bounded staging workloads. Interest-based personalization must not itself mint topic reputation.

**Release gates:** verified schema/migrations and backups, authorized identity mapping, atomic idempotent reactions and independent concurrent tests, trusted topic attribution/authority, aggregate correctness past row limits, zero/legacy vote handling, privacy, calibrated anti-brigade experiments and false-positive review, shadow evaluation without live writes, accessibility, and gradual opt-in with rollback. No real staging or live validation has been done.

Local prototype verification: 266 tests in 52 files passed; typecheck and build passed; ESLint reported 0 errors and 2 existing warnings.

## Minor fixes and clarified exposure metric

- **Local fixes:** post creation rejects dates outside JavaScript's representable range before serialization; ordinary reaction switches no longer issue a redundant delete for the same opposite vote, and inconsistent existing two-direction rows are cleaned on toggle. These operations remain multi-step and are not proven safe under concurrency. Tests use mocks.
- **Topic safety:** authenticated topic creation used service-role `merge-duplicates` on a caller-supplied ID, allowing an existing topic's fields to be overwritten. It now performs a plain insert and returns 409 for conflicts; this intentionally changes duplicate-create behavior. The client no longer claims a failed create will automatically sync; no retry queue exists. Mock tests do not establish deployed schema, RLS or authorization; the topics-to-circles transition remains separate and data-preserving.
- **User clarification:** the proposed metric named “latency” is views divided by impressions, with a lower ratio meant to lead to higher recommendations. This is not network latency; the name and definitions need careful user-facing treatment. Counts, denominator-zero handling, sample size, repeated exposure, eligibility and abuse controls are undefined. A lower views/impressions ratio might equally describe poor relevance, so promoting it alone could amplify low-quality posts; compare against bounded exploration and feedback before a ranking change. No impression or ratio tracking is implemented.
- Existing `experts` API stores declared expertise and credential review status, not a validated per-topic influence/trust score; `useReputation` XP is local IndexedDB state, not trusted server authority. Topic follows and post tags are not yet a verified topic reputation pipeline. Do not treat any of these as an authoritative voting weight without identity, permissions and design review.

Local verification of these fixes: 275 tests across 53 files passed; typecheck and build passed; ESLint reported 0 errors and 2 existing warnings; git diff --check passed. No staging or production systems were touched.

## Expert verification prerequisite — local follow-up

The user explicitly requested usable Life/House/Lunch/Mouth choices and verified topic-specific voting authority. These features are **not complete**: the current `user_tag_authority` scaffolding does not define a verified evidence/provisioning pipeline, and expert credential review is not equivalent to per-topic vote authority. Do not assign or display verified scores from client interest or self-declarations. Existing legacy `mouth` defaults do not represent explicit choices. Identity mapping, trusted topic attribution, atomic tiered vote writes and scoring contracts, evidence verification/revocation/appeal, and staged security/concurrency tests remain prerequisites. No vote UI or live scoring was wired in this follow-up.

One prerequisite was hardened locally: expert admin review previously accepted an allowlisted email without checking Firebase's `email_verified` claim; review now requires that signed claim to be boolean true, as well as the existing allowlist. This intentionally fails closed for reviewers without verified email and requires an operator-reviewed admin/identity rollout. Expert submit and review now use owner/status or pending-status predicates in the final update and check returned IDs, instead of a mistakenly double-prefixed ID filter followed by a false success. Review of non-pending applications now returns 409. Log statements no longer include upstream error objects. Synthetic signed JWT tests check claim extraction and signature tampering; HTTP tests mock auth/storage and do not prove real Firebase, reviewer role management, Supabase schema/grants or multi-user concurrency. Reviewer `reviewed_by` and expert ownership still use Firebase subjects despite UUID columns in the migration; audited identity provisioning/mapping remains required before deployment. An email allowlist plus verified claim is not a complete long-term RBAC solution.

Latest verification: 282 tests across 55 files passed, typecheck and build passed, ESLint 0 errors/2 existing warnings, and git diff --check passed. No live or staging changes.

## Launch-pressure local follow-up

- Firebase token verification now requires a nonempty subject of at most 128 characters and positive safe-integer `exp`/`iat` claims before comparing times. Previously missing or nonnumeric signed claims could bypass numeric comparisons. Synthetic signed-token tests cover malformed claims, expiry, future issuance and tampering; they do not establish real Firebase configuration or revoked-token handling.
- Personalized feed responses now retain the API's `Cache-Control: no-store` instead of overriding it with a private browser cache window. Mocked HTTP tests cover both feed modes; browser and intermediary behavior still needs validation. Server-side feed caching is unchanged.
- No unresolved Git index conflicts or conflict markers were found in the tracked workspace scan. `npm audit --omit=dev` returned zero reported production-dependency vulnerabilities at the time of the local check; this is not a complete security audit.
- **New operational finding, not fixed:** the Redis-backed read, write and auth limiter instances all construct `rl:<ip>` keys, despite separate intended budgets, and `/api/search` uses the same read limiter again via `/api`. INCR and EXPIRE are separate operations, so a failure between them may leave a persistent key. Review isolation, atomic TTL, fallback and proxy behavior and test with a real disposable Redis before release. In-memory limiters have separate maps but remain per-instance.

Latest local verification: 295 tests across 56 files passed; typecheck and build passed; ESLint 0 errors with 2 existing warnings; `git diff --check` passed. No staging, production, migrations or real-user data were touched. **Do not treat this as launch clearance:** database schema/migrations, identity provisioning and authorization, backups/restore, privacy/legal, real cross-user and device tests, and the requested tiered reactions/authority remain unresolved.

## Redis rate-limit local follow-up

The runtime Redis limiter now uses separate read/write/auth key namespaces and one Lua invocation to increment and set or repair expiration atomically. New keys intentionally do not reuse older unnamespaced counters; existing Redis keys are not deleted. Search no longer traverses the same read limiter twice (a deliberate budget behavior correction). The legacy exported non-atomic helper remains only for compatibility/tests; the application factory uses the new helper. Mock tests exercise namespace isolation, shared counters, malformed results and fallback signals; local HTTP testing exercises search counting. There is no real Redis test here. Verify Redis Lua support, expiration, concurrency, multi-instance consistency, proxy configuration, failure fallback, retention of IP-derived keys and rollout in disposable staging. Memory fallback is still per-instance and initial Redis connection failure still requires a process restart to retry.

Local verification after Redis follow-up: 298 tests in 57 files passed; typecheck and build passed; ESLint reported 0 errors and 2 existing warnings; git diff --check passed. No real Redis, staging or production was touched.

## Post tags implementation — local feature follow-up

Post tags are now carried through the immediate and offline-replay create payload using a shared mapper, validated by the server (up to 10 nonempty trimmed tags, each at most 40 characters), stored with the post and returned in feed responses. The composer limits typed tag length and reports invalid tag sets. `0010_post_tags.sql` proposes an additive `text[]` column with an empty default; isolated PGlite tests show existing sample rows preserved when it is applied twice. Mocked HTTP tests cover validation and create-to-feed mapping; a payload test covers the shared online/offline mapping. These are not real offline/device or Supabase end-to-end tests. Historic browser-only tags are not backfilled.

**Deployment dependency:** the updated create and feed SQL expect `posts.tags`; deploying this API before the reviewed migration is present will break those operations. `IF NOT EXISTS` does not repair an incompatible pre-existing column. Verify actual schema, migration history, grants, backup/restore and identity mapping, then review and test the additive migration in isolated staging before any deployment. Reverting the API does not require dropping tags; dropping the column destroys data and requires authorization and verified backup. This implements tag transport, not topic expertise, tiered votes, scoring, impressions or ranking.

Local verification: 305 tests across 60 files passed; typecheck and build passed; ESLint 0 errors and 2 pre-existing warnings; `git diff --check` passed. No staging, production, live migrations or user data touched.

## Explicit tiered vote foundation — local feature work

Added proposed migration `0011_tiered_vote_foundation.sql`, not applied to any external database. It introduces service-only topic authority grants and separate explicit tiered post votes. Its unwired desired-state function resolves the verified subject mapping and actual post topic on the database side, requires an active grant for that exact topic, snapshots a server-stored authority score, stores one direction/tier per account/post under a transaction advisory lock, and permits a user to remove their own tiered vote after revocation. It does not alter ordinary reactions or interpret historical default `mouth` rows as user choices. PGlite tests cover each tier, direction change/removal, topic isolation, unmapped accounts, revocation, invalid input and simplified role privileges.

**Not complete or deployable:** no trusted grant issuance/review/revocation/appeal workflow exists; the `evidence_reference` is not independently verified. The existing API authenticates Firebase but provisioning and actual Supabase identity mapping remain unresolved. The separate tier vote table does not yet have a versioned/idempotent API, UI, feed aggregation or synchronization with ordinary reactions; it is intentionally unwired and disabled. The score snapshot needs a policy for grant revocation, regrant and topic changes; historic votes must not be counted under a different topic or silently reappear after regrant. The advisory lock only coordinates consumers that use the same lock; independent concurrent PostgreSQL/Supabase and existing-client tests are required. Untrusted client callers cannot be given service-role access. No claim of true expertise, brigading resistance, penalties, confidence, factual accuracy or launch readiness follows from these tests. Migration sequencing, actual schema/grants, index/constraint conflicts, privacy, backup and rollback still require review on isolated staging; don't apply 0011 to live data.

Local verification of the tiered-vote foundation: 314 tests across 61 files passed; typecheck and build passed; ESLint 0 errors and 2 existing warnings; git diff --check passed. No live systems or migrations were touched.

## Local migration-chain follow-up

The user's current instruction says migrations have not been applied anywhere. Under that assumption, 0002 was edited to guard optional pgvector and use distinct dollar delimiters, and 0004 removes an invalid time-dependent index predicate. `lib/migration-chain.integration.test.ts` passes a full fresh 0001–0011 chain and an 0005–0011 re-apply against local PGlite with stub auth and **without** pgvector. The vector-present path, actual Supabase roles, grants, schema and behavior are not tested. Never treat these results as authorization to deploy; independently verify migration history and extension permissions. Full re-application is not claimed: 0001 creates policies unconditionally.

The review tables and preliminary identity inventory are in `LOCAL_MIGRATION_AND_IDENTITY_REVIEW.md`. Multiple routes still use Firebase uid for UUID fields. 0011 is unwired and requires explicit authority grants, so it does not satisfy the requested low-baseline vote behavior; there is no tier UI/API, rate budgets, authority event job, impression pipeline or shadow ranking. No new product behavior was enabled in this follow-up. Previously implemented post tags and topic conflict handling are not protected by newly requested default-off feature flags; they must be addressed before a release.

Local test results: 314 tests/61 files before; 316 tests/62 files after; typecheck/build pass; ESLint 0 errors/2 existing warnings; `npm audit --omit=dev` reports 0 vulnerabilities. These local checks do not establish production readiness.
