# P0 safety readiness ledger

Status: **incomplete, not production-ready**. These are staging-only scaffolds; no database migration was applied to staging or production in this session. Existing API behavior is not protected by the new scaffolds until it is migrated and tested end-to-end.

| Area | Evidence / remaining work |
| --- | --- |
| Baseline | 195 tests passed, typecheck/build passed, ESLint 0 errors and 2 warnings before P0 changes. |
| Identity | Firebase token subject is currently passed directly to endpoints, while Supabase ownership uses UUID `auth.users` keys and API service-role access bypasses RLS. Migration 0007 and `requireMappedIdentity` provide one-to-one mapping and fail-closed lookup scaffolding, but are **not wired to endpoints**. Establish verified provisioning, migrate and isolate all relevant endpoints before enabling. Do not infer identity mappings from email. |
| RLS | Static review: 0001 defines RLS policies but several reads are public; 0002 creates `skills` without enabling RLS, so private/in-review records can be exposed if grants permit direct access; 0003 adds hashes to publicly readable profiles, with potential privacy exposure; 0004 enables RLS on its six tables, including public expert reads; 0005 is an RPC and must be reviewed for definer privileges; 0006 and 0007 restrict their new tables. Effective grants, deployed schema, view/function privileges, service-role routes and real two-user isolation are **not verified**. Audit/fix before production. |
| Reactions | 0007 adds a service-only transaction and per-user/post advisory lock, with PGlite rollback testing on simplified schema. It is **not wired to the route**. Concurrency with other writers, cross-user count snapshots, existing data, actual grants, and deployed schema need real PostgreSQL staging tests. Existing route still performs non-atomic writes. |
| Flags | 0007 seeds default-off server records and `requireServerFeature` fails closed, with mocked tests. Neither is wired into routes or the existing client-only experimental feed. Client flag is advisory; do not treat it as authorization or a server kill switch. |
| Export/delete | Not implemented. Data spans Supabase, Firebase/Firestore and browser IndexedDB; partial exports must not be presented as complete. Account deletion must remain dry-run-only until identity, ownership, retention and backup procedures are established. |
| Content security | Existing Node server sends a restrictive CSP without unsafe-inline scripts, but deployment paths, third-party services and browser behavior were not verified. Story HTML is displayed as React-escaped text; a rendering test checks a script payload. This is not a full browser CSP test. |
| Product claims | Three visible labels were softened; this is not a complete product-wide claim audit. |
| Release gates | Final local suite 203/203, typecheck/build passed, ESLint 0 errors/2 pre-existing warnings, `git diff --check` passed. PGlite is not a substitute for actual Supabase RLS/grants or concurrency tests. No real staging, production or Android device validation performed. |

Before any database operation: verify backups, assess existing deployed migrations and privileges, use a controlled isolated staging environment, test rollback and secure identity provisioning, and obtain authorization. The rollback in 0007 drops data and itself requires backup and explicit authorization.

## Focused follow-up

- No reaction RPC shadow was activated: `toggle_post_reaction_atomic` **writes** and would apply a second toggle to the same account/post. A safe shadow must be read-only or run in an isolated rollback/snapshot; comparisons must use the pre-write state and account for concurrent changes. It is not equivalent to calling the existing RPC. Seven-day divergence and 100% active staging identity coverage remain future release criteria, not achieved results.
- The existing opt-in experimental feed runs in the client on already-fetched posts. There is no TSRG-specific server feed or stake endpoint to gate, and the server flag middleware is still unwired; it is not a kill switch. A genuinely server-enforced ranking requires architecture and offline behavior decisions. Ordinary reactions and chronological/following feeds were not changed. Mock HTTP tests cover one ordinary upvote and degraded feed, not real database or end-to-end behavior.
- Claims search covered TSX UI text, API response strings and the data-quality SSR template. This follow-up qualified the public data-quality page's metadata, operational, provenance, score, licensing, endpoint status and accuracy claims. The existing `/api/v1/datasets` metadata still contains unsupported claims (including verification, licensing and raw PII); it was not altered because the session excludes corpus/API work. It is a release blocker, not a verified dataset or licensing service. Search terms alone cannot establish a complete claims audit.


## Desired-state reaction and metadata follow-up

- `0008` adds a separate service-only `set_post_reaction_atomic` desired-state setter, leaving the existing toggle RPC and user-facing route unchanged. Its PGlite tests use simplified tables. A stale delayed setter can overwrite a newer action, and ordinary toggle-off is not represented; it is not suitable for live shadow writes. No migration was deployed.
- `GET /api/me` is a new authenticated read-only endpoint using the existing mapping lookup. It returns the mapped UUID only on success, 401 for unmapped identity and 503 on lookup errors. It does not integrate mapping into existing endpoints. HTTP tests mock auth and database.
- `/api/v1/datasets` metadata now marks all categories and licensing unavailable and replaces unsupported verification, provenance, confidence, licensing, pricing, trial, access, privacy and availability claims with non-assertive descriptions. This is a metadata correction, not a corpus implementation. The separate `/api/v1/search` placeholder contract was not altered.

## Read-only preview and online-client status follow-up

- Migration `0009_reaction_preview.sql` adds a service-role-only, stable read-only preview of the `0008` desired-state setter, not the ordinary toggle route. It is unwired and was not applied outside isolated PGlite. The current reaction schema has no tier or updated-at field: tier transitions and a reliable concurrency token are not implemented (the response explicitly gives a null token). A snapshot is not a lock; this cannot establish safe live shadow comparisons.
- `/api/tsrg/status` reads the existing `experimental_tsrg_feed` flag from `0007` (not the similarly named, unseeded `tsrg_experimental_feed`); missing configuration, row or DB failure yields false. The opt-in browser feed polls it, defaults to chronological while awaiting a response or after failure/timeout, and resets on offline events. Default and Following paths do not request the status.
- This is a **soft kill switch for cooperating online clients only**, not an absolute control: older app versions and offline clients can still use local ranking. Polling, suspended tabs, networks and intermediary behavior limit propagation. It is not an authorization boundary. Previous ledger statements that no online check exists describe the earlier state, not the current code.
- Tested in isolated PGlite, mocked HTTP and happy-dom only. No production/staging verification, deployment, identity provisioning or concurrency tests performed.

## Schema and permission audit (local)

Migration 0001 defines `reactions` with `id`, `target_type`, `target_id`, `user_id`, `reaction_type`, and `created_at`. Migration 0007 adds `reaction_tier_source`, a non-null provenance marker defaulting to `legacy_default`, with `explicit_choice` as the other allowed value. It does **not** add a tier value or an `updated_at` field. The PGlite reaction harness does load 0007, on simplified tables, and now directly checks the marker, default and constraint. Earlier wording saying “no reaction-tier field” meant no field storing the actual tier; it should not have implied that the source marker was absent. Deployed schema is unknown. `IF NOT EXISTS` does not repair a pre-existing incompatible column or constraint.

`created_at` does not change when 0008 updates a vote. A content hash can repeat after an A→B→A change and does not detect intervening events. Neither is a safe concurrency token. The 0009 preview stays unwired with a null token; safe shadow comparisons need an appropriately designed version/snapshot protocol and staging validation.

| Migration | Local permission review |
| --- | --- |
| 0005 | Creates no tables. `save_brain_atomic(uuid,jsonb,jsonb)` revokes PUBLIC/anon/authenticated execution and grants service_role; PGlite grant test passes. Security invoker; service-role access still requires application-level authorization. |
| 0007 | New `user_identity_map` and `server_feature_flags` have RLS enabled, no policies (default deny for roles subject to RLS), PUBLIC/anon/authenticated table privileges revoked, service_role CRUD granted. The toggle RPC is revoked from PUBLIC/anon/authenticated and granted to service_role. PGlite checks do not establish deployed role inheritance, ownership or service-role routes. |
| 0009 | Creates no tables. Preview RPC revokes PUBLIC/anon/authenticated execution and grants service_role; PGlite grant test passes. |

No 0010 schema fix or 0011 RLS fix was created: the observed source marker and local grant declarations match 0007's stated source-marker scope. Actual tier semantics and a concurrency version are separate unresolved design decisions. No migration was applied to a live database.

## READY (verified locally)

- 229 tests passed in 44 files; typecheck and build passed; ESLint had zero errors and two existing warnings. Tests use local mocks and PGlite where indicated, not live services.
- Identity lookup middleware and `/api/me`, default-off server-flag records, online-client status check, reaction setter and read-only preview exist as scaffolds. They are not evidence of a deployed or secure integrated system.
- Keep experimental, stake, slashing and corpus functionality disabled; ordinary local functionality is not contingent on enabling these scaffolds. No blanket offline safety claim is made.

## BLOCKED ON STAGING

- Real PostgreSQL/Supabase RLS and effective privilege verification, including bypass/ownership behavior and service-role API paths.
- Test identity provisioning and mapping lifecycle, then validate separately for real users; staging tests cannot prove all production mappings exist.
- Concurrent writers, reaction ordering and rollback; realistic multi-user isolation and adversarial testing.
- Migration 0005 compatibility and deployment planning, and reviewed validation of 0006–0009; no deployment is authorized by this ledger. Brain-save API depends on 0005 and valid identity mapping.
- Any TSRG user-facing rollout requires staging validation and further safety review; browser/device and product validation also remain open.

## BLOCKED ON DECISIONS

See `DECISIONS_NEEDED.md` for safe defaults and all eight questions: staging access/backups, identity provisioning, experimental-feed soft-switch scope, shadow comparison design, stake/slashing/corpus policy, data rights/deletion/retention, actual tier schema, and reliable concurrency-version semantics. The existing source-marker column does not settle what the tier value should be. No decision is marked approved without the user's explicit answer.

## Phase 1 status: CLOSED LOCALLY

Closed on 2026-11-16 at pre-closure commit b0abda95. This means local handoff is complete; it does NOT mean local work cannot be reopened if a critical issue is discovered. Handoff artifacts: PHASE_1_CLOSURE.md and NEXT_SESSION_STAGING_CHECKLIST.md. Staging verification is required before any production decision.

Correction to earlier entries: `0006_tsrg_foundation.sql:14` does add `reactions.tier` with default `mouth`; `0007` adds the separate `reaction_tier_source` marker. A default does not establish an explicit user choice. The 0009 preview does not model tier and its comment claiming no tier column is inaccurate after 0006. No migration or application code was modified during this closure. See the handoff for the brain-save Firebase-subject/UUID incompatibility, migration prerequisites, and local-only export/deletion limitations.


## Brain identity integration after local closure

Protected brain save/list/read/delete paths now use `user_identity_map` via `lookupMappedIdentity` or `requireMappedIdentity`; public brain reads remain independent. This deliberately changes behavior for unmapped users, who fail closed, and the old mocked test asserting raw Firebase `p_uid` was replaced with a mapped-UUID assertion. Additional mocked HTTP tests cover two users and outages. The provisioning mechanism, existing account mappings, schema compatibility, staging and real multi-session correctness are not verified. Do not deploy before reviewed provisioning and staged validation. The prior closure section and direct-UID findings describe the historical commit, not this working tree.
