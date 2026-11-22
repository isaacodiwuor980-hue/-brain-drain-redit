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
