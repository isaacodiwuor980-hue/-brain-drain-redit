# Brain Drain

> **Release status:** This branch includes temporary privacy and data-safety pauses. Local saves are not automatically backed up or synced; library, publication and other features may be unavailable. Do not run production migrations, the backup script or deployment instructions without reviewing `LAUNCH_REMEDIATION_EXECUTION_PLAN.md`, live schema compatibility and the exact operational effects. Local test success is not production verification.

> A human knowledge engine where experts drain their reasoning into structured decision brains. Local-first PWA (IndexedDB) with optional cloud sync (Supabase + Firebase Auth).

## Quick Start

```bash
# 1. Install dependencies
npm ci

# 2. Copy env config (works with zero cloud config for local-only mode)
cp .env.example .env

# 3. Development (Vite HMR + Express API on :3000)
npm run dev

# 4. Production build + start
npm run build
NODE_ENV=production npm start
# → http://localhost:3000
#
# `npm start` runs scripts/serve.js — a resilience wrapper that:
#   • auto-builds (runs `npm run build`) if dist/ is missing, so a fresh
#     clone works with just `npm install && npm start`;
#   • respawns the server on any crash (bounded restart budget so a real
#     bug surfaces instead of looping forever);
#   • forwards SIGINT/SIGTERM so a single Ctrl-C tears the whole tree down.
# Run it from a persistent terminal / process manager (pm2, systemd, Docker,
# a host platform) for a preview that survives across sessions.
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with Vite HMR middleware |
| `npm run build` | Build client (`dist/`) + bundle server (`dist/server.cjs`) |
| `npm start` | Run production server (`node dist/server.cjs`) |
| `npm test` | Run vitest suite (57 tests) |
| `npm run typecheck` | TypeScript strict type-check |
| `bash scripts/deploy.sh` | Build + graceful restart (zero-downtime) |
| `bash scripts/ensure-server.sh` | Start auto-restarting server (setsid) |
| `scripts/backup-supabase.sh` | Legacy script: unsafe/unverified; do not run as a recovery plan |
| `k6 run scripts/load-test.js` | Run load test (smoke/load/stress/spike) |
| `npm run lint` | ESLint (0 errors enforced) + TypeScript typecheck |
| `npm run test` | Vitest unit suites |
| `npm run typecheck` | TypeScript project check |
| `npm run format` / `format:check` | Prettier write / verify |

## Environment Variables

See [`.env.example`](.env.example) for the full list with descriptions. Key variables:

- `PORT` — server port (default 3000)
- `NODE_ENV` — MUST be `production` for the server to serve the built bundle
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — cloud sync (optional; app runs local-only without)
- `FIREBASE_PROJECT_ID` — auth token verification
- `CORS_ORIGIN` — comma-separated allowed origins
- `MAINTENANCE_MODE` — `true` returns 503 on all routes except health
- `REDIS_URL` — when set, the rate limiter shares its budget across all instances via Redis and falls back to per-instance in-memory if Redis is unreachable; unset → in-memory only. Authentication is Firebase (Google popup + email/password); the unused email-OTP scaffolding was removed.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (PWA)                                          │
│  ├── React 19 + wouter + TanStack Query                 │
│  ├── IndexedDB (17 stores, local-first)                 │
│  ├── Service Worker (offline shell + cache-first)       │
│  └── Firebase Auth (Google popup + guest)               │
└───────────────┬─────────────────────────────────────────┘
                │ HTTPS
┌───────────────▼─────────────────────────────────────────┐
│  Express 5 Server (server.ts → dist/server.cjs)         │
│  ├── Security headers (CSP, HSTS, X-Frame-Options)      │
│  ├── Rate limiting (in-memory, per-IP)                  │
│  ├── /api/* routes (Zod validation + requireAuth)       │
│  ├── SSR routes (/verify/:userId, /brain/:brainId)      │
│  └── Static dist/ serving (production)                  │
└───────┬───────────────────────┬─────────────────────────┘
        │                       │
┌───────▼───────┐      ┌───────▼───────────────────────┐
│  Supabase     │      │  Firebase                     │
│  (Postgres)   │      │  (Auth + Firestore profiles)  │
│  posts,       │      │                               │
│  reactions,   │      │                               │
│  topics       │      │                               │
└───────────────┘      └───────────────────────────────┘
```

**Data flow:** Some operations save to IndexedDB; automatic brain upload and offline replay are paused. Selected public API reads use Supabase via the Express server, while Firebase Auth supplies tokens for protected routes. Identity mapping, account isolation, other writers, and actual cloud persistence remain unverified. Local data is not automatically a cloud backup.

## Testing

```bash
npm test                    # 57 unit tests (vitest)
npm run typecheck           # TypeScript strict
k6 run scripts/load-test.js # Load test
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the step-by-step go-live guide.

## How to keep it stable (vibecoding checklist)

Small habits that prevent 90% of the incidents this app has ever had:

- **Never bypass the gates.** `npm run typecheck && npm test && npm run build` must pass before every commit. The smoke (`scripts/feature-smoke-test.ts`) and stress (`scripts/backend-stress.mjs`) suites run against a live server after deploy.
- **Keep the first-load budget.** The eager chunk graph is ~193 KB gzip (~3.9 s on Slow 3G). New heavy libraries (firebase, d3, charts) must stay inside lazy route chunks — check `dist/index.html` after adding a dependency; if a new big chunk appears there, fix `manualChunks` in `vite.config.ts`.
- **Server changes**: read PORT from env, never crash on a bad request (the `uncaughtException`/`unhandledRejection` handlers + the central error middleware in `api-server/src/app.ts` exist for this — don't remove them), and mount new middleware BEFORE the SPA catch-all.
- **New API routes** go in `api-server/src/routes/`, get zod validation + a rate-limit tier, and return JSON errors via the shared helpers (`lib/http-errors.ts`) — never leak stack traces.
- **Local-first writes** must always succeed offline: wrap cloud sync in try/catch, log ONE compact line (`…deferred: <message>`), keep the IDB copy (see `hooks/use-social.ts` pattern).
- **Never register a service worker** — stale SWs caused the historical "preview disappears / blank page" incidents. `/sw-killer.js` actively unregisters them; leave it in `index.html`.
- **Restart recipe** (dev and prod are the same shape): `npm run build`, then `node dist/server.cjs`. Verify with `curl localhost:3000/api/healthz` → 200 before calling it deployed.

## Operations

See [RUNBOOK.md](RUNBOOK.md) for incident response, rollback, and common failures.

## License

Private. All rights reserved.
