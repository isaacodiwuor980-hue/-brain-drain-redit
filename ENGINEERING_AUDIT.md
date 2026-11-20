# Engineering investigation and issue register

Date: 2026-11-16. Scope: investigation of this repository and its locally running application, including earlier work in this session. This is an **interim audit**, not evidence that every control or production integration has been tested. No production load or destructive database operation was performed. No real 1,000-agent team or 1,000-user session was deployed.

## A. Overall health and architecture

The application has a React/Vite frontend using Wouter and TanStack Query, IndexedDB local storage, Firebase authentication, and an Express API using a Supabase service-role PostgREST client. The source registers 13 named client routes plus a not-found fallback and approximately 54 route-handler declarations across 19 API route files. These are inventories, not counts of fully tested pages or endpoints.

At the start of this session the typecheck failed; earlier work repaired that and added test coverage, cache policy, API retry/offline logic, reasoning views, navigation and other fixes. In this investigation, the baseline test suite and build passed, but critical data-integrity and authorization risks remain. **The application is not yet cleared for production**: authenticated multi-user operations and real database behavior have not been verified.

## B–C. Issue register

The initial nine-item register below is not exhaustive; subsequent findings include critical authorization and account-isolation risks. Severity labels are triage, not production clearance. Several items remain open or require production verification.

| ID | Severity | Area and reproduction / evidence | Root cause | Repair and verification / status |
|---|---|---|---|---|
| I-01 | High | Save a brain or import a shared brain while IndexedDB access is blocked. Earlier cache-style `put` operations resolved without writing. | `lib/db.ts` suppresses storage-access errors for cache writes, but local-first brain operations treated those writes as authoritative. | **Fixed:** `saveBrainWithNodes` rejects on blocked storage; `hooks/use-database.ts` and `ShareBrainModal.tsx` use it. `lib/db.brain-transaction.test.ts` verifies rejection. UI error presentation still needs browser testing. |
| I-02 | High | A node write fails after its brain or another node was saved. Earlier code used separate transactions, leaving a partial brain. | Local brain and node writes were not atomic. | **Fixed:** the same helper commits both stores in one transaction; fake-indexeddb test verifies successful commit and rollback on an uncloneable node. |
| I-03 | High | In `POST /api/brains`, an authenticated caller supplies a node ID already belonging to another brain; additionally two callers can race ownership checks for a previously absent brain ID. | `api-server/src/routes/brains.ts` performs a separate ownership probe followed by privileged service-role upserts. Node IDs are globally keyed and node upsert can overwrite a conflicting row. The read/check/write sequence is not atomic. RLS does not protect service-role requests. | **Implementation and isolated tests added, not deployed or production-verified:** migration `0005_atomic_brain_save.sql` and the API now perform the save through a service-role-only database transaction. PGlite tests exercise ownership, node collisions, rollback, references, and role grants; HTTP tests use mocked auth/database. Independent multi-session race tests and real Supabase/Firebase staging validation remain outstanding. Deploy the migration before API code; missing RPC fails closed. Do not expose the path to untrusted users until assessed. |
| I-04 | High | Inspect `hooks/use-database.ts`: cloud sync failures are only logged, while subsequent fetches cache cloud rows over local rows with the same ID. | No durable retry/conflict resolution is demonstrated for this save path. Previously, stale cloud metadata also replaced a local edit. | **Partially mitigated:** cloud list caching now inserts only absent records atomically and the actual merge preserves local records. Regression tests cover local preservation. This deliberately favors local data and can leave cloud changes stale; durable pending writes, versioned conflict handling and staging verification remain open. |
| I-05 | Medium | Read `api-server/src/lib/firebase-auth.ts` and `supabase/migrations/0001_initial_schema.sql`: Firebase `sub` is used as `uid`, while `brains.author_id` is a UUID referencing Supabase `auth.users`. | No identity mapping is evident in this path. Firebase subjects are not guaranteed to be Supabase UUIDs. | **Open, integration risk, not live-verified.** Confirm deployed schema and identity provisioning, then design and test an explicit identity mapping before migration. |
| I-06 | Medium | On a fresh device, `listBrains` caches brain metadata, while `getBrainData` in `hooks/use-database.ts` reads nodes exclusively from IndexedDB. | The list flow does not fetch and persist cloud node details. | **Partially implemented:** newly cached cloud metadata is explicitly marked; opening it fetches authenticated details and atomically caches nodes only if the local stub is unchanged. Tests cover successful hydration, local-edit races, network errors and node collisions. Existing unmarked metadata-only caches are not migrated, and real two-device authentication and persistence still need staging verification. |
| I-07 | Medium | Other local writes, such as branch operations and seed paths, still use the cache-style `idb.put`/`putAll` behavior. | The original cache fallback is shared with local-first features. | **Open.** Audit each authoritative write path, migrate appropriate operations to strict transactions and verify user-facing errors. The new helper does not make all application writes durable. |
| I-08 | Low | `openDB()` fails once and a later access retries. | A rejected cached connection promise could persist and prevent recovery. | **Fixed:** the failed attempt clears itself without replacing a newer attempt. Regression test verifies retry after synchronous open failure. |
| I-09 | Low | `npm audit` reports nine moderate dependency findings; ESLint reports two warnings; Vite reports deprecated `advancedChunks` and ignored `manualChunks`. | Transitive tooling dependencies and chunk configuration require maintenance. | **Open.** Review and update with compatibility testing; no blanket forced upgrade was applied. Audit reports no high or critical dependency advisories at time of execution. |

Additionally, the shared import uses a ref-based in-flight guard; its interaction-level double-click behavior has not yet been browser-tested. `lib/brains-sync.test.ts` now exercises the actual merge implementation.

### Subsequent sync repairs

- **Offline replay race (high, partially fixed):** replay previously replaced the queue with a snapshot, losing actions enqueued during network calls. The new reconciliation preserves new/coalesced actions and schedules future retries; pure tests cover three race cases. Cross-tab atomicity, durable storage failure, and complete end-to-end replay are not verified.
- **Brain deletion (high, partially fixed):** deletion previously removed brain and nodes separately and the drawer reported permanent success without awaiting the operation. Local deletion is now one strict IndexedDB transaction, and UI feedback distinguishes unconfirmed cloud deletion. Unit tests cover local behavior and mocked cloud outcomes. Unconfirmed cloud deletion is not queued; a cloud copy can return. Real browser and Supabase deletion remain untested.

- **Private library authentication:** `listBrains` now sends the supplied Firebase token; previously `?mine=true` was sent without it. Mocked-fetch regression test confirms the header. Live Firebase/Supabase verification remains outstanding.
- **GET isolation:** requests carrying headers or explicit credentials are no longer coalesced solely by URL; a test exercises concurrent different bearer tokens.
- **Timestamp shape:** brain API responses now include `created_at` in addition to the existing `createdAt`, aligning with the frontend `Brain` type. This server change has not been verified against a live database.
- **Cloud detail hydration:** new metadata-only cache entries fetch nodes on opening; failures are displayed with retry and never replace an in-flight local edit. Legacy unmarked entries, shared-device account isolation, offline conflict handling and real cross-device testing remain open.
- **Brain write transaction:** migration 0005 must be applied before deploying the new API code. It makes owner checks and node writes atomic and denies conflicting node IDs; if absent, saves return an error instead of falling back to the vulnerable path. Deploy only after a backup and staging tests, including multi-session concurrency and Firebase-to-Supabase identity mapping. Roll back by reverting the API first and then dropping the new function. This was not applied to any live database.

## D. Frontend audit

Source-level inventory includes home, search, missions, personality test, onboarding, community, messages, notifications, profile, library, topics, topic details and settings. Earlier HTTP checks returned the SPA shell for several direct paths; that does **not** prove the client route or its interactions work. Reasoning components have server-render smoke tests and navigation/fuzzy matching have unit tests. Existing saved-topics and pathways tab implementations were not fully re-audited.

No browser binary or Playwright package was available in this sandbox. Therefore clicks, button/icon/form counts, modal behavior, responsive layouts, console output, accessibility in a real browser, and full user journeys remain **untested**, not passed. `scripts/frontend-stress.mjs` was made configurable but was not run; it requires an external browser tool.

## E. Backend and integration audit

Inspected the brain write/read handlers, Supabase REST client, authentication middleware, API middleware, database schema and the local/cloud save path. Earlier local HTTP probes covered health, body parsing, cache headers, feed and several SPA shell responses. Those probes do not validate authenticated database operations, authorization, notifications, uploads, real registration or persistence. No production credentials or production data were used.

## F. Performance

Earlier single-instance local tests with raised rate limits produced roughly 2,200–2,260 requests/s in three short 800-VU repeats with zero recorded 5xx/network errors. Requests to the brain write endpoint were unauthenticated and rejected before database work; these measurements **cannot demonstrate improved database write latency or production capacity**. First-paint eager JavaScript was measured earlier at approximately 158 KB gzip versus a 175.4 KB baseline; these figures are for those builds, not a full current-network waterfall. Atomic local saves reduce individual IndexedDB transactions, but no performance benchmark was performed for this change.

## G. Security

The brain-write service-role authorization and identity-mapping concerns above require priority assessment. The dependency audit identified nine moderate findings, including minimatch and postcss-selector-parser transitive tooling dependencies. Audit results are not a security certification; other routes, access controls, secrets, third-party integrations and the deployed environment have not been comprehensively tested.

## H. Verification

- `npm run typecheck`: passed.
- `npm test`: See the latest execution results in the session response. IndexedDB tests use fake-indexeddb, not an actual browser; database transaction tests use PGlite, not a deployed Supabase instance.
- `npm run build`: passed, with two Vite chunk-configuration warnings.
- `npx eslint .`: 0 errors, 2 warnings in Dashboard and SearchPage.
- `git diff --check`: passed.
- `npm audit`: 9 moderate, 0 high and 0 critical advisories at execution time.
- The sanitizer test emits an expected happy-dom iframe-loading diagnostic on stderr while passing.
- End-to-end authentication, cross-device persistence, live Supabase authorization and concurrent writes, file upload, mobile/cross-browser and accessibility testing: **not performed**.

## I. Next actions / blockers

1. Set up an isolated staging Supabase project and test Firebase identities, with representative schema and disposable accounts; design and verify the atomic authorization/write fix before deployment.
2. Reproduce and repair offline cloud-conflict and cloud-node hydration flows with two devices and failure injection.
3. Provision Playwright plus browser binaries in an appropriate environment; run desktop/mobile interaction and accessibility suites and record per-control outcomes.
4. Audit remaining local-first storage writes and test real browser quota, abort, reload and blocked-storage behavior.
5. Review dependency advisories and migrate the Vite chunk configuration, then remeasure the actual initial dependency graph.

### Offline identity isolation and Firestore rules (local changes)
- Queued social actions now capture their Firebase UID. Replay selects only the current UID, rechecks the session between requests, and leaves legacy unowned entries untouched. Token acquisition failures defer owned work instead of treating it as a guest action; auth retry is delayed to avoid a tight loop. Pure queue/coalescing and reconciliation tests cover mixed owners and legacy entries, but the hook, account switching during real requests, cross-tab concurrency and storage failures remain unverified. Legacy entries need a safe recovery UX; they are not automatically claimed.
- Board ownership takeover and unrestricted pin writes are restricted in `firestore.rules`. These changes are not deployed or tested in the Firestore emulator; validate existing clients and permissions in staging before deploying.
- Realtime session rule mitigation: updates are restricted to the existing host and cannot change hostUserId. This repository uses IndexedDB, not Firestore, for realtime sessions. External Firestore clients may rely on participant writes, so verify them and define a field-level collaboration protocol before deployment. Rules are not deployed or emulator-tested. Local IndexedDB data is not comprehensively account-scoped, and localStorage queue operations have no cross-tab lock.

### Further local durability repair
- Social post creation and reaction writes now use strict IndexedDB writes, rejecting blocked storage instead of presenting a no-op as saved. Fake IndexedDB and blocked-storage tests cover the write primitive; complete browser interaction and cloud behavior remain unverified. Other authoritative local write paths still need an audit.
