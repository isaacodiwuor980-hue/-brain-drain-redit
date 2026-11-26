# Changelog

All notable changes to MindSpool are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added — Production readiness (this iteration)
- **Graceful shutdown** — SIGTERM/SIGINT handler drains in-flight requests (10s timeout) before exit; uncaughtException/unhandledRejection handlers log + exit for clean restart.
- **`/api/ready` readiness probe** — checks Supabase connectivity (2s timeout) and returns 503 if not ready. Distinct from `/api/healthz` liveness probe.
- **Maintenance mode** — `MAINTENANCE_MODE=true` env var returns 503 on all routes except `/api/healthz`.
- **Expanded `.env.example`** — every env var documented with safe defaults.
- **Dockerfile** — multi-stage build (node:22-alpine), non-root user, tini PID 1, healthcheck. Image ~180MB.
- **`.dockerignore`** — excludes node_modules, dist, .git, logs, backups from build context.
- **`docker-compose.yml`** — single-service compose with resource limits, restart policy, log rotation.
- **GitHub Actions CI** — install → typecheck → test → audit → build → Docker build → smoke test → deploy-to-staging. Cancel-in-progress on same branch.
- **k6 load test** — smoke/load/stress/spike stages with custom metrics (feed latency, health latency, error rate).
- **Supabase backup script** — `pg_dump` to timestamped gzip file, 30-backup retention.
- **Supabase seed data** — 6 default topics (AI Safety, Health, Finance, Career, Relationships, Creativity).
- **README.md, DEPLOYMENT.md, RUNBOOK.md** — full operational documentation.
- **Service worker v4** — bumped cache version to purge stale dev-mode caches that broke browser preview.
- **`/notifications` empty state** — illustrated CTA (BellOff icon + "Browse the feed" button) replacing bare "No notifications found."

### Fixed
- **CRITICAL: `server.ts` hardcoded `PORT=3000`** — now reads `process.env.PORT` with 3000 fallback. Previously broke PaaS deploys (Render/Railway/Fly inject PORT).
- **CRITICAL: Build failed — `recharts` missing from `package.json`** — `ProfileJourneyChart.tsx` dynamic-imports recharts but it wasn't installed. Added `recharts@^2.15.0` to dependencies.
- **HIGH: IDB write durability** — `idb.put()`/`delete()`/`clear()` resolved on `request.onsuccess` (fires on queue, not commit) instead of `tx.oncomplete`. Caused silent data loss on transaction abort. Fixed all 3 methods.
- **HIGH: Service worker offline fallback returned `null`** — `.catch(() => cached)` referenced a null `cached` variable when no cache existed. Now falls back to cached index.html or a 503 Response.
- **HIGH: `X-Frame-Options: DENY` blocked iframe preview** — changed to `SAMEORIGIN` + added `frame-ancestors 'self'` to CSP. App now loads in iframe-based preview environments.
- **MED: Notification analytics blocked cache invalidation** — `await trackEvent` inside mutationFn caused the entire mutation to reject on analytics failure, leaving notifications stuck "unread" in UI. Analytics is now fire-and-forget.
- **MED: StoriesBar interval recreation** — `progress` in effect deps caused ~100 interval teardown/recreate cycles per 5s story. Fixed with ref-mirror + visibilitychange listener.
- **MED: StoriesBar markAsViewed loop** — IDB write fired every time `groupedStories` re-derived. Fixed with session-scoped Set.
- **MED: Post-vote optimistic UI** — added `onMutate` for instant cache update; `onError` only rolls back on local failures (POST_NOT_FOUND, IDB_WRITE_FAILED), not transient network errors.
- **MED: MindChatRuntime session resume** — closing the dialog mid-run discarded progress. Now persists to sessionStorage; reopen resumes where you left off.

### Security
- **CSP + X-Frame-Options** tuned for preview environments while maintaining clickjacking protection.
- **npm audit fix** reduced vulnerabilities from 7 to 6 (remaining are firebase-internal @grpc/grpc-js, require firebase major upgrade — documented as known risk).
- **No secrets in code** — only public Firebase client config (safe by design; security via Firestore Rules). `.gitignore` excludes `.env*`.

## [0.1.0] — Pre-release

### Initial features
- Local-first PWA with IndexedDB (17 stores, DB v17)
- Decision-mind editor with node graph (question → outcome tree)
- Social feed with posts, comments, reactions (upvote/downvote/repost)
- 4-river comment system (Facts, Experience, Debate, Breakthrough)
- Hive-Mind maintenance (14-day pruning, 30-day fossilization)
- Provenance chain (SHA-256 signed edit history)
- Confidence scoring (0-100 transparent formula)
- Dispute resolution workflow
- Stories bar (24h expiring notes)
- Missions + milestones + XP + streaks
- Personality test
- Community circles with check-ins
- Pathways (scenario-based learning)
- Firebase Auth (Google popup + guest mode)
- Optional Supabase cloud sync
- SSR routes for SEO (/verify/:userId, /mind/:mindId, /verify/record/:recordId)
- Service worker (offline shell + cache-first assets)
- 223 unit tests (14 test files)
