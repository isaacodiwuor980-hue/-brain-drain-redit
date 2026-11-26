# MindSpool — Stability & Performance Audit (2026-11-15)

Supersedes the Phase-1 audit of 2026-11-06 (kept as `AUDIT_REPORT.md`). Scope: full repo (React/Vite frontend, Express 5 + pino API server, local-first IndexedDB, Supabase cloud sync, Docker deploy). Method: on-disk verification of every hardening claim, fresh gates, live route probes, browser console sweep, bundle measurement, 2-minute soak. No code was rewritten blindly; every fix below is small and reversible.

## Verdict

The app was already substantially hardened by earlier commits (`c2adb8c`, `ec177a4`, `edb715b`). This audit found **0 Critical, 1 Medium + 1 Low root-cause cluster, 3 Low issues** — all fixed and verified. Historical "server crashes / preview disappears" causes are confirmed fixed (details below).

## Issues found & fixed

| # | Sev | Issue | Root cause | Fix | Verified by |
|---|-----|-------|-----------|-----|-------------|
| M1 | Medium | `index.html` meta description advertised the removed "4 rivers" comment system | `ec177a4` removed rivers but SEO/LLM copy was never updated | Rewrote description to match reality (upvote/downvote + House/Mouth, consensus library) | Built HTML inspected |
| M2 | Medium | Console spammed with full `ApiError` stacks ×N every guest session | Guest-mode cloud sync correctly defers on 401, but 3 hooks logged the whole error object (stack included) | `use-topics.ts`, `use-database.ts`, `use-social.ts` now log one compact line: `…deferred: <message>` | tsc + vitest + clean console sweep (only `[log]` sw-killer entries remain) |
| L1 | Low | No `engines` field in `package.json` | Vite 7 needs Node ≥20.19; nothing pinned it | Added `"engines": { "node": ">=20.19.0" }` | npm read-back |
| L2 | Low | Older Android WebView / Samsung Internet not guaranteed | Vite default build target covers only modern baseline browsers | `build.target: "es2020"` in `vite.config.ts` (Chrome 80+, Safari 13.1+) | Fresh build 1.84 s, no warnings; app boots |
| L3 | Low (no fix needed) | Suspected missing font fallback | False alarm | `--app-font-sans` already puts system fonts first, Inter as fallback — optimal for low-end devices | `index.css:130` |

## Root cause of historical "server down / preview disappears"

All previously reported causes are verified fixed on disk and at runtime:

1. **Stale service worker serving old chunks → blank page.** Fixed via external CSP-compliant `/sw-killer.js` (the inline version was blocked by `script-src 'self'`), plus chunk-hash versioning. The console shows it actively unregistering stale SWs.
2. **Port conflicts / hardcoded port.** PORT is read from env with validation + 3000 fallback (`server.ts:21-25`), bound to `0.0.0.0`.
3. **One bad request killing the process.** `uncaughtException` + `unhandledRejection` handlers log-and-continue + Sentry (`server.ts:179-194`); central error middleware in `api-server/src/app.ts:130-160` never leaks stack traces; async route rejections are contained.
4. **First visitor after a container recycle paid 2.4 s cold feed cache.** Feed pre-warm on boot (`server.ts:157-162`).

## Verified-good inventory (no action taken)

- **Server**: security headers + strict CSP + HSTS; brotli/gzip (threshold 1 KB, smart filter); maintenance-mode gate mounted before the API; `/api/*` 404 JSON before the SPA catch-all; static cache 1y immutable + HTML no-cache; graceful SIGTERM/SIGINT with 10 s force-exit; Sentry request/error handlers.
- **API organization**: `api-server/src/{routes,lib,middleware}`; zod validation; CORS whitelist with wildcard support + default-deny; two-tier rate limiting (writes stricter than reads); body size caps; pino JSON logs with request IDs; `.env.example` (8 KB) + fail-loud `lib/config.ts`; Supabase client with timeouts.
- **Deploy**: Dockerfile uses `tini` as PID 1 + `HEALTHCHECK /api/healthz`; docker-compose healthcheck; RUNBOOK with incident response and common failures.
- **Frontend**: 13 lazy routes; firebase split (the 498 KB Firestore chunk stays lazy); sw-killer; non-blocking font injection with `display=swap`; viewport with `viewport-fit=cover` and zoom permitted (a11y); dark mode via CSS vars.

## Measured performance (before → after)

| Metric | Before | After |
|---|---|---|
| Typecheck | 0 errors | 0 errors |
| Unit tests | 57/57 | 57/57 |
| Smoke suite | 38/38 | 38/38 |
| Stress suite | 26/26 | 26/26 |
| Build | 1.38 s, no warnings | 1.84 s (es2020), no warnings |
| First-load eager payload | 193 KB gzip | 193 KB gzip (budget kept) |
| Slow 3G transfer estimate | ~3.9 s (< 5 s target) | ~3.9 s |
| Route probe (/, healthz, feed, bogus API, SPA, llms.txt, sitemap) | all correct | all correct |
| Console (5 routes) | 3 × ApiError stack dumps | 0 errors, 0 warning-stacks |
| Stability soak | — | 1440 mixed requests / 120 s → alive, healthz 200 |

Lighthouse mobile could not run: the sandbox has no Chrome binary (Lighthouse 13.6.0 installed but cannot launch a browser). The payload math + route timings above are the performance evidence. Run `npx lighthouse http://localhost:3000 --form-factor=mobile` on a machine with Chrome for the official scores.

## Still risky / needs your input

1. **`firebase-auth` chunk (~199 KB) loads on the on-boot session check** even for guests. Could be deferred further, but that risks changing auth timing — left alone deliberately.
2. **Guest-mode 401 sync attempts** still fire (now compactly logged). A client-side "skip sync when unauthenticated" check would save requests — needs a product decision.
3. **CORS default-deny** when `CORS_ORIGINS` is unset is safe, but cross-origin previews (StackBlitz etc.) need that env var set — documented in `.env.example`.
4. **`es2020` target** is a one-line revert (`vite.config.ts`) if any transpilation surprise appears in an old WebView — build + all suites verified after the change.
5. **Lighthouse scores** unverified in this environment (no Chrome) — run locally when possible.
