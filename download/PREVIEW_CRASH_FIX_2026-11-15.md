# Preview Crash — Root Cause & Fix (2026-11-15)

Commit: `beaa9aa` on `feat/community-rebuild` (3 files: `package.json`, `.env.example`, `server.ts`; `.env` edited locally, gitignored).

## The exact error

Not a thrown exception — a **silent misconfiguration**. Every page route (`/`, `/search`, `/minds`…) returned **HTTP 404** while `/api/*` worked fine. The server process stayed alive (healthz 200 every 60 s), so it *looked* healthy — but the browser got nothing. The app appeared "down," and restarting the server never fixed it.

## Root cause (in plain language)

Your `.env` file had this line:

```
NODE_ENV=production
```

`server.ts` loads `.env` **before anything else** (line 3: `import "dotenv/config"`). So even when you ran `npm run dev`, `NODE_ENV` was already `production`. Then `server.ts` line 118 checks:

```ts
if (process.env.NODE_ENV !== "production") {
  // Vite dev middleware (HMR, live source)  ← NEVER taken
} else {
  // serve the built dist/ bundle            ← always taken
}
```

So `npm run dev` was secretly running in **production mode** — serving files from `dist/` instead of starting the Vite dev server. That worked only as long as `dist/` existed and was fresh. The moment `dist/` went missing or stale (after a code change, a `rm -rf`, a dependency update, or a cache clear), **every page route 404’d** → preview "down." Restarting didn't help because `.env` kept forcing production mode, so the dev server kept needing a rebuild it was never told to do.

`.env.example` had the same line, so the bug propagated to fresh clones too.

## What I changed (root cause, not a restart)

1. **`package.json`** — the npm script now sets the run mode, not the env file:
   - `dev`: `NODE_ENV=development tsx server.ts` → guarantees the Vite dev branch.
   - `start`: `NODE_ENV=production node dist/server.cjs` → guarantees the production branch.
   - dotenv never overrides a variable the script already set, so this is deterministic regardless of what's in `.env`.

2. **`.env` + `.env.example`** — removed `NODE_ENV=production` entirely. Added a comment explaining NODE_ENV is set by the npm script, never by `.env`, and why pinning it breaks `npm run dev`.

3. **`server.ts`** — two safeguards so this class of failure can't recur silently:
   - **Production branch**: checks `fs.existsSync(dist/index.html)` at startup. If the build is missing, it throws a clear, actionable error (`Run "npm run build" or use "npm run dev"`) instead of silently 404-ing every route.
   - **Dev branch**: wraps `createViteServer` in try/catch. If Vite fails to start, it logs a clear message (`rm -rf node_modules/.vite && npm run dev`) and exits instead of limping along serving nothing.

No features removed. No restart-as-a-fix. The existing global handlers (`uncaughtException`, `unhandledRejection`) already log-and-continue (don't crash the server on transient API errors) — those are correct and left alone.

## How I verified it stays up

- **Clean from scratch**: `rm -rf node_modules/.vite dist` → `npm run build` (3469 modules, 1.35 s, `dist/` produced) → `NODE_ENV=production node dist/server.cjs`.
- **Browser stress test**: skip intro → continue as guest → open a post → **post a comment** → Upvote / House / Mouth vote buttons all present and working → **3 full reloads**.
- **After reloads**: app fully rendered (`root` innerHTML 109 KB, 81 interactive buttons). **Zero console errors. Zero server-log errors. Server PID unchanged (4145)** — it never crashed or restarted through the entire interaction + reload sequence.
- Gates: `typecheck` 0 errors, `vitest` 57/57, `build` success.

## Commands to run it

```bash
# Live development (Vite HMR — use when you have direct localhost browser access):
npm run dev

# Production preview (no WebSocket dependency — the right mode for proxied/hosted previews):
npm run build && npm start
```

## One thing to know about `npm run dev` in a proxied preview

`npm run dev` now correctly enters Vite dev mode. Vite's hot-reload uses a **WebSocket**, which some hosted-preview proxies don't forward. In that case you'll see `[vite] connecting...` without `connected`, and module loading can stall. That's a proxy/WebSocket limitation, not a code bug — for proxied previews, use `npm run build && npm start` (production, no WebSocket needed). The fix above makes both modes work correctly; it doesn't change which one your preview should use.

## Remaining issue (low, not from this bug)

`lib/offline-sync.ts` is still a write-only queue (actions enqueued on failure are never replayed) — noted in the prior refactor report, unchanged here. Unrelated to this crash.
