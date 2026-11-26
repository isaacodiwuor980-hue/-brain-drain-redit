# MindSpool — Full Code Audit Report (Phase 1)

**Date:** 2026-11-06 · **Auditor:** Senior staff engineer audit (AI-assisted, evidence-based)
**Scope:** All 332 git-tracked files + untracked working tree, ~49,857 lines of TS/TSX
**Method:** BFS import-graph resolution from the true entry chain (index.html → main.tsx → App.tsx), route-registration tracing, string-reference tracing, dependency usage grep, security review. **No changes made in Phase 1.**

---

## 1. Executive Summary

The app is functionally healthy (feed verified end-to-end on the live preview today), but it carries **~90 dead files, 9 one-off AI-edit scripts, an entire dead second app, 5 unused runtime dependencies, 1 production-breaking dependency bug (zod), 7 confirmed backend logic bugs, and 2 high-severity security findings** — all leftovers from AI-assisted updates that replaced code without deleting it.

| Metric | Value |
|---|---|
| Git-tracked files | 332 |
| Live frontend files (reachable from entry) | 144 |
| Dead frontend files proven | 41 |
| API endpoints registered | 62 (45 called by frontend) |
| Backend logic bugs confirmed | 7 |
| Security findings | 2 high, 3 medium, 3 low |
| Unused runtime dependencies | 5 (+1 misplaced types pkg) |
| **Production-breaking dep bug** | **zod in devDependencies — `npm prune --production` would crash the server** |

---

## 2. Architecture (verified)

```
PRODUCTION PATH
  server.ts (root, thin wrapper)
    ├─ security headers (CSP, HSTS, XFO)
    ├─ compression (brotli/gzip)
    ├─ import apiApp from "./api-server/src/app"   ← THE API
    │    ├─ pino-http logging, CORS (fail-closed), body limits
    │    ├─ rate limiters (write: /api/events,/api/client-errors; read: /api)
    │    ├─ routes/index.ts mounts 22 routers → 62 endpoints
    │    └─ centralized error handler
    ├─ SSR: /sitemap.xml, /llms.txt, /data-quality
    ├─ maintenance-mode gate   ⚠ mounted AFTER apiApp → never gates API (bug C-8.3)
    └─ static dist/ + SPA catch-all

FRONTEND
  index.html → main.tsx → App.tsx (wouter SPA)
  Alias: "@/components" AND "@" → project root  (components/ dir is NOT the target!)
  13 lazy routes (pages/), flat root components (all 14 LIVE), ui/ = shadcn kit (26 of 58 live)
  Data: TanStack Query → lib/api/* → api-client.ts (same-origin default) + IndexedDB v19 cache

LEGACY / DEAD STACKS COEXISTING
  api-server/src/index.ts — second standalone entry (never used)
  functions/ + firebase.json /api/** rewrite — orphaned Firebase deployment
  mockup-sandbox/ — entire dead second Vite app (32 files)
```

**Critical type-safety gap:** `tsconfig.json` **excludes `api-server/`** — the entire backend ships with zero type checking (`npm run lint` = typecheck only).

---

## 3. Feature Inventory

| # | Feature | Files (main) | Status |
|---|---|---|---|
| 1 | Home feed (posts, tabs, live sessions, daily challenges) | pages/HomeFeed, feed/*, hooks/use-social | ✅ working (verified live today) |
| 2 | Minds library / pathways | pages/LibraryPage, library/PathwaysTab+SavedTopicsTab+ShareModal | ✅ working |
| 3 | Topics browse/follow | pages/TopicsPage, TopicDetailPage, hooks/use-topics | ✅ working |
| 4 | Profile | pages/ProfilePage, profile/* (5) | ✅ working |
| 5 | Search | pages/SearchPage, api/v1/search + habits/skills search | ✅ working |
| 6 | Settings | pages/SettingsPage | ✅ working |
| 7 | Missions | pages/MissionsPage, hooks/use-mission-reminders | ✅ working |
| 8 | Personality test (BFI-10) | pages/PersonalityTestPage, api /api/personality | ✅ working (tables pending migration 0004) |
| 9 | Messages | pages/MessagesPage | ✅ working (local) |
| 10 | Notifications | pages/NotificationsPage | ✅ working (local) |
| 11 | Community (experts/mentors) | pages/CommunityPage, community/*, api experts+mentors | ✅ working (tables pending migration 0004) |
| 12 | Onboarding flow | onboarding/OnboardingFlow + OnboardingTour | ✅ working |
| 13 | Auth (Firebase + guest + email OTP stub) | auth/AuthContext, api auth-otp | ⚠️ partial — OTP verify returns mock token (bug C-8.5) |
| 14 | Mind builder (wizard, node editor, drawer) | WizardModal, NodeEditor, MindDrawer, RuntimeEngine | ✅ working |
| 15 | Create launcher | CreateMenu, ui/CreateExperienceModal | ✅ working |
| 16 | Share / import / report | ShareMindModal, ImportModal, ReportBugModal | ✅ working |
| 17 | Offline cache & sync | lib/db (IDB v19), lib/offline-sync, hooks/use-offline-sync | ✅ working |
| 18 | Analytics | lib/analytics, api /api/events, api-server/lib/analytics-store | ✅ working |
| 19 | Admin gate (expert verification) | lib/admin-gate, ui/admin-gate-dialog, api experts verify | ✅ working (ADMIN_EMAILS) |
| 20 | Recall (SM-2 spaced repetition) | api /api/recall, scripts SM-2 tests 14/14 | ✅ working (anti-tamper claim false — C-8.6) |
| 21 | SSR extras (sitemap, llms.txt, data-quality) | server.ts, lib/data-quality-page | ⚠️ partial — advertises non-existent routes (C-8.4) |
| 22 | Discover people (contacts/gmail) | feed/FindFriends*, hooks/use-discover+contact-sync+google-contacts | ⚠️ partial — set-contact-hash never called (B-39) |

---

## 4. Dead-Code Report (all proven — evidence in audit trail)

### 4a. Junk artifacts (Phase 2 deletes)
| Item | Evidence |
|---|---|
| `mockup-sandbox/` (32 files) | Standalone 2nd Vite app; only referenced by tsconfig EXCLUDE + a test SKIP_DIRS; its source dir `src/components/mockups/` doesn't even exist |
| 9 root `.py` scripts | One-off string/regex patchers (`update_css.py` etc.); changes long applied; referenced by nothing |
| `.tsbuildinfo` | Build artifact tracked in git; dirty on every typecheck |
| `bun.lock` | Stale duplicate lockfile (npm is canonical: CI + Dockerfile + README all use npm); missing 5 current deps |
| `screenshots.html` + `scripts/capture-screenshots.mjs` | Static mock gallery + screenshot script requiring playwright (not installed); reference only each other |
| `firebase-blueprint.json` | Unreferenced AI-tooling schema artifact |
| 8 `public/` files (`_redirects`, 5 placeholders, icon-dark/light-32x32) | Zero references (Netlify artifact + unused scaffold assets) |
| `data/analytics-events.jsonl` (tracked) | Runtime analytics data — 1,283 lines of real session data committed to git; must be untracked + ignored (kept on disk) |
| `vite.config.ts` `@assets` alias | Points to non-existent `attached_assets/`; zero users |

### 4b. Dead frontend files (Phase 2 deletes)
| Group | Files | Evidence |
|---|---|---|
| `components/` dir | `components/onboarding/OnboardingFlow.tsx` | Byte-identical duplicate of live `onboarding/OnboardingFlow.tsx`; the `@/components` alias maps to project ROOT, so App.tsx's import resolves to the root copy. Zero importers of the `components/` copy |
| `ui/` (32 of 58) | accordion, alert, aspect-ratio, breadcrumb, button-group, calendar, carousel, collapsible, command, context-menu, drawer, empty, field, form, hover-card, input-group, input-otp, item, kbd, menubar, navigation-menu, pagination, popover, radio-group, resizable, sidebar, slider, sonner, spinner, table, toggle, toggle-group | Zero exact imports project-wide (verified with precise import-specifier grep, not substring); toggle imported only by dead toggle-group; sidebar is sole importer of dead use-mobile |
| `hooks/` (4) | use-api-health, use-device-features, use-gamification, use-mobile | Zero importers (use-mobile only by dead ui/sidebar) |
| `lib/` (3 + test) | firebase.ts, smart-image.tsx, puzzle-share.ts (+ its test) | firebase.ts superseded by firebase-app/auth/firestore; zero exact imports |
| `library/` (2) | MindDNA.tsx, ReadTab.tsx | Zero importers; types.ts defines its own `MindDNA` interface (no import); smoke-test only asserts their ABSENCE |

### 4c. Dead backend (Phase 2/3 deletes or decision)
| Item | Evidence |
|---|---|
| `api-server/src/index.ts` | Second standalone entry (own http server + shutdown); referenced by no script/Dockerfile/package.json |
| `functions/` + firebase.json functions block + `/api/**` rewrite | Orphaned Firebase deployment; rewrite targets a function "api" that doesn't exist (deploying Firebase Hosting from this repo would break the API). Collections they serve are never written. **→ NEEDS MY DECISION** (is the Firebase project still running the cleanup cron?) |
| Uncalled endpoints (17) | events/summary, intelligence/summary, recommendations/minds, v1/health/detailed (dead); skills/habits GET+DELETE, datasets, search/v1, verify + provenance 501 stubs (future/contract surface) **→ NEEDS MY DECISION** on which to keep |

---

## 5. Bugs Found (confirmed, with evidence)

| # | Bug | Location | Impact |
|---|---|---|---|
| B-1 | **zod in devDependencies but bundled into production server** (esbuild `--packages=external`) | package.json | `npm prune --production` / `npm ci --production` → server crashes on `require("zod")` |
| B-2 | Feed cache repost count: `repost_count ?? 0 + reposts` — precedence + snake_case-vs-camelCase mismatch means base count always dropped on cache hits | api-server/src/routes/feed.ts:96 | Wrong repost counts on cached feed responses |
| B-3 | `z.coerce.boolean()` — `?mine=false` coerces to `true` | api-server/src/routes/minds.ts:35 | Guests get 401 instead of public list |
| B-4 | Maintenance middleware mounted AFTER apiApp | server.ts:70 vs 98 | Maintenance mode never gates API traffic |
| B-5 | Search double-query: first Supabase query fired then discarded when keyword present | api-server/src/routes/search.ts:76-88 | 2x latency + wasted quota on every search |
| B-6 | discover/follow swallows insert failure, returns 204 | api-server/src/routes/discover.ts:146-155 | Silent data loss |
| B-7 | Unmatched `/api/*` paths return SPA index.html (200 HTML) | server.ts:122-125 | API clients get HTML instead of 404 JSON |
| B-8 | OTP verify returns mock base64 token that JWKS always rejects | api-server/src/routes/auth-otp.ts:221-228 | Email OTP flow cannot complete (by design P1, but frontend wires it as if real) |
| B-9 | skills.ts converts every error (incl. 500s) to 404 | api-server/src/routes/skills.ts:78-81 | Masks real failures |
| B-10 | config.ts throws at import-time when PORT unset → server.ts's documented 3000 fallback unreachable | api-server/src/lib/config.ts:39-46 | Confusing crash without PORT |
| B-11 | Feed cache is an unbounded Map (no eviction) | api-server/src/routes/feed.ts:72-74 | Memory leak / cheap DoS via offset variation |
| B-12 | requireAuth collapses JWKS/network errors into 401 | api-server/src/middleware/auth.ts:26-28 | 5xx masked as 401 |
| B-13 | SSR pages advertise routes that don't exist (/verify/:userId, /mind/:mindId) | server.ts:89, data-api.ts:150 | SEO/LLM surface pointing at 404s |
| B-14 | MAINTENANCE_MODE read once at boot — contradicts documented incident usage | server.ts:98 | Requires restart during incidents |
| B-15 | Recall "anti-tamper" is client-controlled (`sm2StateBefore` supplied by client) | api-server/src/routes/recall.ts:36-41 | Docstring claim false |

---

## 6. Security Findings

| # | Severity | Finding | Location |
|---|---|---|---|
| S-1 | **High** | Rate limiter keyed on spoofable `X-Forwarded-For`; Express `trust proxy` never set → rate limiting bypassable by rotating XFF | rate-limit.ts:31-34, app.ts |
| S-2 | **High** | OTP code returned in response body by default (mock delivery) — anyone can request a code for any email and read it. Landmine once real token minting lands | auth-otp.ts:118-120 |
| S-3 | Medium | `/api/v1/health/detailed` publicly exposes memory usage, environment, feature flags | data-api.ts:119-159 |
| S-4 | Medium | `:id` params unvalidated in experts/mentors routes (raw values into PostgREST `eq.` filters) while other routes enforce slug regex — inconsistent defense | experts.ts:239+, mentors.ts:227+ |
| S-5 | Medium | In-memory rate limiter + OTP HMAC key + feed cache assume single instance; `docker-compose --scale` breaks them silently | rate-limit.ts, auth-otp.ts:44-48 |
| S-6 | Low | Admin gate = plain env email list (no RBAC/audit) | experts.ts:28-36 |
| S-7 | Low | `X-Frame-Options: ALLOWALL` (deliberate for preview; CSP frame-ancestors is the real control) + HSTS on plain HTTP | server.ts:30,36 |
| S-8 | Info | ✅ Good: service-role key server-only; CORS fail-closed; JWKS verification solid; all 27 write endpoints correctly require auth; no secrets in client code; `.env` properly gitignored |

---

## 7. Dependency Findings

**Remove (proven unused at root):** `cookie-parser` (+`@types/cookie-parser`), `drizzle-orm` (zero Supabase-SQL code; project uses REST), `firebase-admin`, `firebase-functions` (only used by dead `functions/`, which has its own package.json).
**Move:** `zod` devDeps → **dependencies** (bug B-1); `@types/compression` deps → devDependencies.
**Keep despite suspicion:** `recharts` (lazy-imported by profile/ProfileJourneyChart.tsx — a naive grep misses it).
**Resulting devDep orphans after ui/ cleanup (Phase 2 removes with the files):** embla-carousel-react, react-day-picker, input-otp, sonner, vaul, react-resizable-panels, react-hook-form, next-themes, and 15 unused @radix-ui primitives — all only imported by the 32 dead ui/ files.
**Env:** `.env.example` documents 20/21 backend vars; missing `SUPABASE_ANALYTICS_TABLE`; documents dead `APP_URL`; missing all 7 `VITE_*` frontend vars.

---

## 8. Verified Working (baseline before changes)

- Feed end-to-end on live preview URL (desktop + 390×844 mobile): onboarding → guest → posts render — fixed earlier today (commit af7336d)
- SM-2 spaced-repetition tests: 14/14 pass
- Server: healthy, uptime verified, dist/ current, build `2026-11-05-sw-sync-fix` + today's feed fix

---

*Phase 2 (permanent cleanup) executes the proven deletions above. Everything ambiguous is listed in NEEDS_MY_DECISION.md and was NOT touched.*
