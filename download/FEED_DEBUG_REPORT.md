# Home Feed Debug Report (2026-11-15)

Request: feed fails in Chrome + mobile, slow/laggy. Method: read feed component (`pages/HomeFeed.tsx`), data layer (`lib/api-client.ts`, `hooks/use-social.ts`, `lib/api/feed.ts`), API route (`api-server/src/routes/feed.ts`), auth (`lib/auth-token.ts`), config (`lib/env.ts`, `vite.config.ts`, CSP in `server.ts`), then reproduction in real Chromium (desktop + 360×800 mobile emulation) with console + network capture.

## 1. Root cause analysis (ranked)

| # | Hypothesis | Evidence | Verdict |
|---|---|---|---|
| 1 | **Stale service worker on user's device** serving pre-fix chunks (fits "works in FF/Safari/Edge — their profiles never registered the old SW") | App now has NO SW (`/sw-killer.js` unregisters); but a device that loaded the OLD deploy may still run the old cache-first SW, so it never receives the new HTML/JS | Most likely for *your* Chrome — not reproducible here (fresh profile is clean) |
| 2 | Chrome extension interference | Only affects specific installs; fresh headless Chromium is clean | Test incognito |
| 3 | CORS / preflight | API is same-origin (`lib/env.ts` empty base → same host; `api-client.ts:43`); no CORS involved | Ruled out |
| 4 | Cookies / SameSite / 3P-cookie phaseout | Auth = Firebase ID tokens via Authorization header (`lib/auth-token.ts`), **zero cookies** | Ruled out |
| 5 | CSP blocking fetch/scripts | Console shows zero CSP violations across pages; `connect-src 'self'` matches same-origin API; no frontend Supabase calls | Ruled out |
| 6 | Storage (IDB) failures breaking feed | `use-social.ts:99-104` guards cache writes (quota/blocked storage never discards cloud data); offline fallback returns cached/seed posts | Already hardened |
| 7 | Unsupported JS APIs | No `.at()`/`structuredClone` in feed paths; build target now es2020 | Covered |
| 8 | Race conditions / infinite loops | Seed effect guarded by `isSeeding`; IntersectionObserver guarded for existence (`HomeFeed.tsx:261`); no passive-scroll listeners needed (IO-based) | Clean |
| 9 | Huge payload / N+1 | `/api/feed?limit=30` = **2.1 KB gzip** (16 posts), `event` field empty; 2 Supabase queries total (author/topic embedded + batched reactions `in.()`); 30s TTL + 5min SWR + bounded LRU | Ruled out |
| 10 | Mobile 100vh bug | `App.tsx:62` used `100vh` in PageLoader | **Confirmed (fixed)** |
| 11 | Image CLS | `PostCard.tsx:530` note photos had no reserved space | **Confirmed (fixed)** |

## 2. Changes (commit `fix(feed): debug pass`)

- `pages/HomeFeed.tsx:592-597` — dry-state copy still advertised the removed "4 rivers" system (missed by the earlier meta-description fix); rewritten to votes + House/Mouth.
- `feed/PostCard.tsx:530` — note photos: added `aspect-[4/3]` so layout space is reserved before load (CLS).
- `App.tsx:62` — PageLoader `100vh` → `dvh` with `supports-` fallback (mobile address bar).
- `tests/e2e/feed.spec.ts` — Playwright spec: chromium/firefox/webkit + Pixel/iPhone emulation, asserts feed renders, no console errors, no failed requests, no horizontal overflow, no false retry-banner. Excluded from vitest + typecheck until `@playwright/test` is installed.
- `vitest.config.ts` / `tsconfig.json` — exclude `tests/e2e`.

Already present (verified, not touched): skeleton loaders, feed-failure banner with Retry (`HomeFeed.tsx:384-404`), timeout via AbortController + exponential backoff (`api-client.ts`), SWR + `placeholderData`, optimistic reactions, `content-visibility:auto` list, lazy heavy components, cursor-style offset pagination + `hasMore`.

## 3. What to run/test on YOUR device (I could not reproduce the failure)

1. **Incognito Chrome** (`Ctrl+Shift+N`) — if the feed works there, it is an **extension**.
2. **Kill any stale service worker**: DevTools → Application → Service Workers → Unregister all; Application → Storage → Clear site data; hard reload (`Ctrl+Shift+R`). This is the #1 suspect.
3. **DevTools → Network tab**, reload, filter `/api/feed`: expect `200`, ~2 KB transferred, `X-Feed-Cache: HIT/STALE/MISS`.
4. **DevTools → Console**: copy any red errors (none are reproducible here).
5. **Phone remote debug**: `chrome://inspect` (Android) or Safari → Develop → device (iOS); repeat steps 3-4.
6. Send me: the console errors + the `/api/feed` row (status, size, time) if anything still fails.

## 4. Before/after

| Metric | Before | After |
|---|---|---|
| Typecheck / unit tests | — | 0 errors / 57/57 |
| Build | — | 1.57 s, no warnings |
| `/api/feed` payload (30) | — | 2.1 KB gzip |
| Feed response (warm SWR) | — | ~1 ms server-side |
| Console (Chromium desktop + 360×800) | — | 0 errors |
| Stale "4 rivers" user-facing copy | present | fixed |
| Note-photo CLS | shift on load | reserved (aspect ratio) |
| PageLoader on mobile | 100vh overflow | dvh + fallback |

Lighthouse could not run (no Chrome binary in sandbox — same limitation as the 2026-11-15 audit).

## 5. Remaining risks / follow-ups

1. The stale-SW hypothesis (#1) can only be confirmed on an affected device — the steps above settle it in one minute.
2. `firebase-auth` (~199 KB) still loads on boot session check even for guests (deferred deliberately; auth-timing risk).
3. Offset pagination is fine at current scale; switch to cursor-based (`created_at` keyset) if posts exceed a few thousand.
4. Playwright spec is delivered but unrun here — needs a machine with browser binaries (`npx playwright install chromium firefox webkit`).
