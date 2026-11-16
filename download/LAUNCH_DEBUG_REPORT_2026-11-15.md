# Brain Drain — End-to-End Debug & Launch Report
**Date: 2026-11-15 · Commit: `e704d4e` · All gates green**

---

## 1. Bug report (before)

| ID | File:line | Symptom | Root cause | Sev | Status |
|----|-----------|---------|-----------|-----|--------|
| B1 | `lib/api/community.ts` (all 14 calls) | Onboarding/personality/experts/recall 401 for **signed-in** users; onboarding dead-ends at "Please sign in to continue." | Calls sent no `Authorization` header; all target routes are `requireAuth` | HIGH | **Fixed** |
| B2 | `feed/PostCard.tsx:539` | Stored XSS: note HTML attachments rendered raw (`dangerouslySetInnerHTML`), PostCreator invites raw HTML, persisted server-side, served to every viewer | No sanitizer at the render boundary | HIGH | **Fixed + 11 tests** |
| B3 | `pages/HomeFeed.tsx:50` + `api-server/.../feed.ts:258-280` | "Following" tab showed For-You content — dead control | Client hardcoded `useSocial("foryou")`; server `fetchFeedPage` never applied `mode` | HIGH | **Fixed (client+server)** |
| B4 | `hooks/use-social.ts:90` | Feed hard-capped at 30 posts | Server `offset`/`hasMore` existed but were never wired | HIGH | **Fixed (infinite scroll)** |
| B5 | `hooks/use-notifications.ts:83-128` | 5 seeded notifications linked to nonexistent `seed-post-1..3` | Seed IDs diverged from real posts; no stale-link guard | MED | **Fixed** |
| B6 | `pages/CommunityPage.tsx:537,540,910,913` | Leave/cancel-join failures = unhandled rejections, no feedback | `.then()` without `.catch` | MED | **Fixed ×4** |
| B7 | `pages/PersonalityTestPage.tsx:108-114` | 250ms auto-advance timer not cleaned on unmount | Bare `setTimeout` outside effect scope | LOW | **Fixed** |
| B8 | `pages/HomeFeed.tsx:215-233` | IntersectionObserver leaked per ref change | Cleanup used `unobserve`, never `disconnect()` | MED(LOW) | **Fixed** |
| B9 | `pages/LibraryPage.tsx:29,52,59-60` | Brain cards dead clicks; ShareModal unreachable (selectedBrain locked `null`) | `onClick={() => {}}`; setter never called | MED | **Fixed** |
| B10 | `hooks/use-social.ts:90` | Mode/topic switches didn't cancel in-flight requests; aborts misread as outages | React Query `signal` not forwarded; abort → `ApiError(0)` misclassified | MED | **Fixed** |
| B11 | `package.json` | 28 client-runtime deps in `devDependencies` (breaks `--production` installs / future SSR) | Metadata placement | LOW | **Fixed** |
| B12 | `api-server/src/routes/auth-otp.ts:238-240` | OTP returns a mock token; **no UI calls it** | Firebase custom-token issuance not built | MED | **Documented, not fixed** (unused; needs firebase-admin — post-launch) |
| B13 | `cold-start-content.ts`, `use-active-sessions.ts`, `use-messages.ts` | Fabricated engagement / mock sessions / demo DMs shown as content | Deliberate cold-start seed design | Design | **Kept** (per your no-feature-removal rule); flagged |
| B14 | `LibraryPage` 4 empty tabs | Modules/Shared/Imported/Timeline are honest empty states | Reserved placeholders | MED | **Kept** (roadmap) |

**Found during live verification (not in any static audit):**

| ID | Symptom | Root cause | Sev | Status |
|----|---------|-----------|-----|--------|
| B15 | Guest sessions hammered `POST /api/posts` → 401 → offline-queue retried ×5 each → **rate limiter saturated → every `/api/feed` returned 429** → "app is down" | Guest cold-start seeds attempted cloud writes with no session | HIGH | **Fixed: guests are local-only** (`token` guards in `use-social.ts` ×2, `use-topics.ts`) |
| B16 | Following view stuck in a skeleton loop | Seed effect: `posts.length===0` → seed → seeds land in For-You universe → Following (cloud-only) never sees them → re-seed → **∞** | HIGH | **Fixed: seeding is For-You only** |
| B17 | Browser served personalized `/api/feed` from HTTP cache **without contacting the server** (stale data after data changes) | No `Cache-Control` on API responses → heuristic caching | MED | **Fixed: `Cache-Control: no-store` on all `/api/*`** |

## 2. Code changes (16 files, all in commit `e704d4e`)

| File | Change |
|------|--------|
| `lib/api/community.ts` | New `authedApi` wrapper — every call now carries the Firebase Bearer token via `getAuthToken()` (B1). Per-module, so guest traffic never loads the SDK chunk. |
| `lib/sanitize-html.ts` **(new)** | Allowlist sanitizer: DOMParser-based; removes scriptable elements whole, strips `on*`/`style` attrs, allowlists safe URL schemes, forces `target=_blank rel="noopener noreferrer nofollow"`, strips comments (B2). |
| `lib/sanitize-html.test.ts` **(new)** | 11 regression tests incl. `<script>`, `onerror`, `javascript:`, `data:text/html`, iframe/svg, comment tricks (B2). |
| `feed/PostCard.tsx` | HTML attachments render through `sanitizeHtml()` (B2). |
| `hooks/use-social.ts` | Rewritten on `useInfiniteQuery` (30/page) with `getNextPageParam` from server `hasMore`; pages flattened + **cross-page dedupe**; React Query `signal` forwarded; aborts classified as control-flow, not failures; mutations updated for InfiniteData shapes (optimistic + rollback preserved); **guest token guards** — no cloud write, no queue entry without a session (B4/B10/B15). |
| `pages/HomeFeed.tsx` | `activeFeed` drives `useSocial(activeFeed, null)` (B3); observer triggers `fetchNextPage` + `disconnect()` cleanup (B4/B8); dedicated "Following is quiet" empty state keyed on emptiness (B3); **seed effect skipped on Following** (B16); "loading more…" indicator. |
| `api-server/src/routes/feed.ts` | `fetchFeedPage(mode, topic, limit, offset, followeeIds)` — Following resolves `user_follows` and filters by followees; guests / undeployed table / zero follows → honest empty page; per-user cache bypass for Following (B3). |
| `api-server/src/app.ts` | `Cache-Control: no-store` on all `/api/*` (B17). |
| `hooks/use-notifications.ts` | Seeds retargeted to real post IDs (B5). |
| `pages/NotificationsPage.tsx` | Click-guard: verifies the post exists in IDB before deep-linking; graceful toast + home otherwise (B5). |
| `pages/CommunityPage.tsx` | `.catch` → toast on leave/cancel (×4) (B6). |
| `pages/PersonalityTestPage.tsx` | Timer ref + unmount cleanup (B7). |
| `pages/LibraryPage.tsx` | Brain cards open a detail dialog; published brains surface the existing ShareModal (B9). |
| `package.json` + lockfile | 28 client deps → `dependencies` (B11); `happy-dom` added for DOM tests. |
| `.env.example` | (from yesterday's fix) NODE_ENV documentation. |

## 3. Test results (after)

| Gate | Before | After |
|------|--------|-------|
| typecheck | 0 errors | **0 errors** |
| eslint | 0 E / 127 W | **0 E / 112 W** (exhaustive-deps 9→0 cleared; rest are style/complexity — see risks) |
| vitest | 57/57 | **68/68** (11 new XSS regressions) |
| build | OK | **OK** |
| npm audit (prod) | 0 reported* | **0 vulnerabilities** (grpc-js override — see risks) |
| Live: feed/post/comment/votes | — | ✅ verified in Chromium |
| Live: Following tab | dead | ✅ honest empty state + server filter |
| Live: notification deep-links | broken | ✅ working |
| Live: mobile 375×812 | — | ✅ 0 horizontal overflow, reloads survive |
| Live: Library brain dialog (B9) | typecheck only | ✅ **live-verified**: card→detail dialog→ShareModal (private + published) |
| Live: console (fresh session) | spam/429s | ✅ **0 errors, 0 429s, 0 401s** |
| Live: preview after restart | — | ✅ healthz 200, feed renders, 0 overflow, 0 console errors |
| Live: Chrome/Opera Mini feed load | failed (HTTP non-secure context) | ✅ **crypto.randomUUID polyfill** — proven via broken-state simulation (1000/1000 unique v4 UUIDs) |
| Live: upvote/downvote | silently no-op | ✅ **onMutate guard** — optimistic count 0→1 + active + pressed, IDB write, mutual exclusion (down unsets up), reload persistence |
| Live: preview crash recovery | bare `node dist/server.cjs` | ✅ **`npm start` wrapper** auto-restarts on crash (see PREVIEW-GUIDE.md) |

## 4. Remaining risks — stated honestly

1. **~~npm audit: 4 high~~ → RESOLVED (0 vulnerabilities).** `@grpc/grpc-js` (transitive via firebase) pinned to `^1.13.6` via `package.json` `overrides`. The vulnerable Node-gRPC transport is never executed in this app (browser Firestore = WebChannel, server = Supabase), so the pin is safe without a firebase major bump.
2. **Lint: 114 warnings** (down from 127). The 9 `react-hooks/exhaustive-deps` (correctness — stale-closure risk) are all cleared (commit `ea31941`). The remaining 114 are `no-explicit-any` (~77), `set-state-in-effect` (~20), `purity` (~14) — style/complexity, not correctness; the app is verified working. Bulk-typing these on launch day risks regressions; recommended as a focused post-launch cleanup pass.
3. **B12 OTP auth is still a mock** — but zero UI calls it, so no user can reach it. Needs Firebase custom tokens + `firebase-admin` post-launch.
4. **B13/B14**: demo content (mock sessions, demo DMs, fabricated engagement counts) and 4 empty Library tabs are **deliberate seed/placeholder design** — kept per your no-removal rule. Decide post-launch whether to keep or replace.
5. **Could not verify signed-in flows end-to-end** (Firebase sign-in requires real credentials in the sandbox). The auth-attach fix is verified by code-trace + typecheck + the exact header pattern already proven by `lib/api/feed.ts`. **Re-test onboarding/personality with a real account** (checklist below).
6. **Following feed with real follows**: server filter verified by code + typecheck; needs a signed-in user who follows someone to verify live (checklist).
7. ~~Library detail dialog unverified~~ → **RESOLVED**: live-verified by creating a brain (UI wizard + IDB), clicking the card → detail dialog opens with title/type/visibility; published brain → Share button → ShareModal with the correct brain name; private brains correctly show no Share button.

## 5. Manual re-test checklist (~10 min)

1. `npm run build && npm start` → open preview → hard-refresh 3× → feed renders, no blank screen.
2. Sign in with a real account → complete **onboarding** → should pass all steps (was: stuck at "Please sign in").
3. Take the **personality test** → submit → "Personality saved" toast (was: 401).
4. Home → **Following** tab → "Following is quiet" message → follow someone (Search/Discover) → their posts appear there.
5. Scroll the feed past 30 posts → **more pages load** (infinite scroll, "Loading more reasoning…").
6. Create a note post with an HTML attachment containing `<script>alert(1)</script>` → saves fine, renders as **inert text**, no alert.
7. Open a post → comment → **Upvote then Downvote** (Down should unset Up) → **House then Mouth** (Mouth should unset House) → reload → votes persisted.
8. Notifications → click items → each opens the referenced post (or a graceful "no longer available" toast — never a broken page).
9. Library → click a brain card → detail dialog opens; Published brain → "Share with the network" → ShareModal.
10. Mobile (375px) → no horizontal scroll, bottom nav works, tabs/composer usable; desktop 1280px → same.
