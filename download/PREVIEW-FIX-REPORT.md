# Home-Screen Preview Fix — Performance & Reliability Report

**Date:** 2026-11-07 · **App:** MindSpool (React 19 + Vite + Tailwind + wouter SPA · Express 5 · Supabase · Firebase Auth · PWA)
**Mission:** Fix the home-screen preview issue + full stability/performance pass per the Phase 1-6 protocol.

---

## 1. Executive Summary

**The home-screen preview bug was a two-layer storage-availability failure, both layers now fixed and regression-guarded:**

The real preview runs MindSpool inside a cross-origin iframe. In storage-blocked contexts — Safari ITP third-party frames, sandboxed iframes, private-mode edge cases — **merely accessing `indexedDB`/`localStorage` throws SecurityError**.

- **Layer 1 (empty feed):** the feed queryFn read its IndexedDB cache *before* the network fetch. The read rejected → the query died → **`/api/feed` was never called** → home feed permanently blank. Reproduced deterministically: **0 feed requests in 12s+**.
- **Layer 2 (blank page):** once layer 1 was fixed, guest sign-in succeeded and HomeFeed mounted — where `App.tsx`'s `GlobalBugModalManager` read localStorage **unguarded** in a mount effect → the throw killed React's commit → **entire app blank**. Reproduced deterministically: empty `<body>`.

**Also found & fixed along the way:** the CSP was silently blocking the Google Fonts loader (inline `onload=` handler — every page load logged a violation and fonts never applied), Firebase Auth generated an unhandled SecurityError rejection in blocked contexts, and the feed API's cold cache cost 514–1900 ms for every "first visitor" per 30 s window (two sequential Supabase round trips).

**Results:** home feed now renders in the worst-case blocked-storage iframe at ~4 s from guest click (skeletons from ~1 s); zero unhandled errors; zero CSP violations; warm feed API responses 1–2 ms (p95 budget 400 ms ✅). Guards: 7 new unit tests + 2 smoke-test budgets + 3 reproducible iframe diagnostic scripts — all committed.

**Honest limitation:** the exact storage policy of the production z.ai iframe could not be inspected from inside the sandbox (the real host page is authenticated). The fix covers **every** storage-availability outcome (fully available, partitioned, fully blocked) and was verified against each — so the production case is covered whichever it is.

---

## 2. Issue Table

| ID | Sev | Symptom | Root cause | Fix | Test/guard | Status |
|---|---|---|---|---|---|---|
| PV-1 | **P0** | Home feed empty in preview (iframe) | Feed queryFn read IDB cache **before** the API call; IDB access throws in blocked-storage contexts → query rejected pre-fetch | `lib/db.ts` storage-access-safe wrapper (reads→`[]`/`undefined`, writes→no-op, logs once) + per-write guards in use-social/use-topics so a cache failure can't discard cloud data | 7 unit tests (`lib/db.storage-blocked.test.ts`) + `scripts/iframe-storage-blocked.cjs` repro | ✅ fixed |
| PV-2 | **P0** | Whole app blank after guest sign-in in preview | `App.tsx` `GlobalBugModalManager` mount effect read localStorage unguarded → throw during React commit → tree unmount | New `lib/safe-storage.ts` (never-throw storage); converted all unguarded sites (App.tsx ×7, SearchPage ×5); repo sweep verified the rest are guarded | Same blocked-storage repro asserts posts render; sweep script output committed in report | ✅ fixed |
| PV-3 | P1 | Unhandled `SecurityError` pageerror in preview | Firebase Auth's internal IDB token store rejects unhandled in blocked contexts | `lib/firebase-auth.ts`: storage probe at init → `browserLocalPersistence` when usable, `inMemoryPersistence` when blocked (guests don't use Firebase at all) | Blocked-repro run shows zero pageerrors | ✅ fixed |
| PV-4 | P2 | CSP violation on every page load; Google Fonts never applied | Inline `onload="this.media='all'"` blocked by `script-src 'self'` — the async-CSS trick silently disabled | External `/font-loader.js` injects the stylesheet post-paint (same non-blocking behavior, CSP-compliant); `<noscript>` fallback kept | Smoke test: served HTML has no inline handlers + font-loader reachable | ✅ fixed |
| PERF-1 | P1 | 1–2 s skeleton wait on "first load" of any 30 s window | Cold feed cache = 2 sequential Supabase round trips (posts → reactions-for-IDs; not parallelizable on this schema) | **Stale-while-revalidate**: entries 30 s–5 min old served instantly (`X-Feed-Cache: STALE`) while one deduped background refresh runs; >5 min → live fetch; refresh failure keeps serving stale | Smoke budget: warm `/api/feed` < 400 ms; live-verified HIT/STALE/HIT cycle | ✅ fixed |

---

## 3. Before / After Metrics

| Metric | Before | After | Evidence |
|---|---|---|---|
| Feed API (cold cache, localhost) | 514–948 ms typical, 1.87 s worst | unchanged cold (1.87 s) but paid by **one background refresh per window** | curl timing loops, this session |
| Feed API (warm / stale window) | 514–948 ms for every visitor after 30 s | **1–2 ms** (HIT + STALE) | curl: `STALE 0.001–0.002 s ×3 → HIT 0.0018 s` |
| Feed API via public preview URL | 90–117 ms | 90–117 ms (unchanged, already cached at edge of the 5-min SWR window) | curl ×3 |
| Feed API payload | 792 B (2 posts) | 792 B | curl `size_download` |
| Blocked-storage iframe: feed requests | **0 in 12 s+** (feed dead) | **2 requests, 200, posts render at ~4 s** | `scripts/iframe-storage-blocked.cjs` before/after DOM samples |
| Blocked-storage iframe: app state | blank page / empty body | full UI + both posts | same script, `user4444: 2, salary: true` |
| Unhandled errors (blocked ctx) | `SecurityError` pageerror + CSP violation | **0 unhandled**; single graceful `[db]` warning | playwright console capture |
| CSP violations per load | 1 (inline font handler) | **0** | console capture, public URL + iframe |
| Unit tests | 35/35 | **42/42** (+7 storage-blocked) | vitest |
| Smoke tests | 36/36 | **38/38** (+SWR budget, +CSP-fonts) | feature-smoke-test |

---

## 4. Preview-Issue Report (per failure case)

| Case | Cause | Result |
|---|---|---|
| Fresh visit → onboarding → guest → empty feed (iframe) | PV-1 (IDB-before-fetch) | ✅ posts render ~4 s; skeletons shown meanwhile |
| Guest sign-in → whole app blank (iframe) | PV-2 (unguarded effect in App.tsx) | ✅ app survives; bug-modal manager degrades gracefully |
| Console `SecurityError` pageerror | PV-3 (Firebase internal IDB) | ✅ none |
| Console CSP violation + wrong fonts | PV-4 (inline handler blocked) | ✅ fonts load via external loader |
| Reload in preview → onboarding reappears | **not reproducible**: guest/onboarding state persists via localStorage in top-level and partitioned-iframe contexts (verified); in a fully-blocked context the state is in-memory for the session — acceptable and unavoidable without server sessions. Marked **unverified on real Safari iOS** (no device in sandbox). |
| Feed slow on first-ever visit | PERF-1 cold path (inherent: Supabase round trips) | ✅ reduced to once per cache window per key; skeletons + SWR make it invisible to all subsequent visitors |

---

## 5. Backend Report

- **Slowest endpoint:** `GET /api/feed` — cold p50 ≈ 740 ms, worst 1.87 s (2 sequential Supabase REST calls; reaction query needs post IDs first). Warm: ~1 ms. SWR added (30 s fresh TTL / 5 min stale serve / deduped background refresh / stale-served-on-refresh-failure).
- **Payload:** 792 B for 2 posts — well under the 100 KB/screen budget. Compression (brotli/gzip) already on for HTML/JS/JSON.
- **Indexes/queries:** no N+1 (2 queries per page, batched `in.(...)` reactions); pagination via limit+offset; Supabase timeout 2.5 s; rate limiting with non-spoofable `req.ip` (S-1 fix, earlier session).
- **Cache headers:** HTML no-cache (fresh preview), hashed assets immutable, `/sw-killer.js` + `/font-loader.js` no-cache via server defaults.

---

## 6. Prevention Now in Place

1. `lib/db.storage-blocked.test.ts` — 7 unit tests: every `idb.*` op degrades under simulated ITP; warning logs once; genuine errors still throw.
2. Smoke budget: warm `/api/feed` must respond < 400 ms (HIT/STALE).
3. Smoke guard: served HTML must contain no inline event handlers; fonts must load via external `/font-loader.js`.
4. `scripts/iframe-storage-blocked.cjs` — one-command deterministic repro of the exact production failure mode.
5. `scripts/iframe-probe.cjs` / `iframe-deep-diag.cjs` — storage + feed probes inside a simulated preview iframe.
6. Codebase rule (enforced by sweep): all storage access goes through `lib/db.ts` (IDB) or `lib/safe-storage.ts` (web storage) — or is individually try/catch-guarded.
7. Existing guards retained: global error boundary with recovery UI, SW-killer, API 404-JSON, LRU feed cache.

---

## 7. Remaining Risks / Unverified / Decisions Needed

1. **Real-device verification (recommended):** the fix is verified in Chromium via deterministic simulations of Safari ITP and sandboxed iframes. If you can, spot-check one real iPhone (Safari, opening the preview from chat) — expected: feed renders. I could not do this from the sandbox.
2. **Production z.ai iframe storage policy** is unknown (authenticated host page). All three outcomes are handled, so no decision needed — but if you can share the platform's iframe `sandbox` attributes, I can confirm which path applies.
3. **Migration 0004** still not applied to Supabase (needs your PAT) — community features degrade gracefully until then.
4. **Cold-start seeder** writes 12 demo posts only when the feed is empty; in fully-blocked contexts those writes are no-ops (cloud posts still render). If you'd rather skip seeding entirely when storage is blocked, say the word — kept as-is for minimal behavior change.
5. **6 transitive npm vulnerabilities** (firebase→@grpc, typography→postcss) await upstream patches — no action possible from this repo.

---

**Commits this session:** `72fc09d` (P0 feed fix) → `4009b4a` (Firebase persistence) → `48a2b42` (CSP fonts) → `7fc0200` (feed SWR) → `0ce6aa0` (regression tests) → `42eb9a4` (P0 blank-page fix) → `e1a8029` (diagnostic scripts). Server rebuilt, running, and verified on the public preview URL.
