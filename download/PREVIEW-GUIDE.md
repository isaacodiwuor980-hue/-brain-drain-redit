# Preview Guide — keeping the app running permanently

This documents the permanent fixes for the two preview problems you kept hitting, and the one thing only **you** can do (the sandbox can't).

---

## What was fixed permanently (commit `b9bca18`)

### 1. The feed failed in Chrome and Opera Mini but worked in Firefox

**Root cause:** `crypto.randomUUID()` requires a **secure context** (HTTPS or `localhost`). On an HTTP preview domain, Chrome / Opera / Safari leave the method `undefined`. The app calls it during feed cold-start seeding, analytics, share-as-post and mind creation → `TypeError: Cannot read properties of undefined` → the feed never renders. Firefox is more lenient about secure-context APIs, which is why it loaded there but not in Chrome/Opera Mini.

**Permanent fix:** `public/crypto-polyfill.js` is loaded **synchronously in `<head>`**, before the app bundle. It installs `crypto.randomUUID` (using `crypto.getRandomValues`, which works in *all* contexts) when the native method is missing, and is a no-op on HTTPS/localhost. It runs before any app code, so no call site can throw.

**Proven:** simulated the exact broken state (deleted the native method), reloaded the polyfill, and verified it restores valid RFC-4122 v4 UUIDs — 1000 generated, 1000 unique, zero collisions.

**Opera Mini note:** Opera Mini in *Extreme* data-savings mode strips JavaScript entirely (server-side rendering) — no client-side app can run there. In *High* / *Data savings* mode it runs JS and the polyfill works. There is no code fix for Extreme mode; users should switch to High mode or any Chromium/Firefox/Safari browser.

### 2. The preview kept dying / crashing

**Permanent fix:** `npm start` now runs `scripts/serve.js`, a wrapper that **respawns `dist/server.cjs` on any crash** (unhandled rejection, port conflict, OOM) with a bounded restart budget (12 crashes in 60s → give up, so a real bug surfaces instead of looping forever). Signals are forwarded cleanly so a single Ctrl-C tears the whole tree down. `npm run start:raw` keeps the bare command for debugging.

### 3. Upvote / downvote did nothing when clicked

**Root cause:** the vote mutation's `onMutate` called `getQueriesData({ queryKey: ["posts"] })` — a *prefix* match that also returns `["posts", ...]` detail queries whose data is **not** an `InfiniteData` shape. The updater then called `old.pages.map(...)` on those → `Cannot read properties of undefined (reading 'map')` → `onMutate` aborted mid-flight → `mutationFn` never ran → no IDB write → the vote silently never persisted. (Firefox appeared to "work" only because the feed rendered; the votes were broken there too.)

**Permanent fix:** the updater now guards `if (!old || !Array.isArray(old.pages)) return old`, so non-infinite queries are skipped. Plus two durability fixes so guest votes survive refetches: `onSuccess` only invalidates for signed-in users (the server doesn't track guest votes, so refetching would clobber them), and the queryFn's `putAll` merges locally-voted posts instead of overwriting them.

**Proven end-to-end:** click upvote → count `0→1`, active class + `aria-pressed=true` instantly; IDB write confirmed; clicking downvote unsets the upvote (mutual exclusion); after a full reload the vote is still in IDB and reflected in the UI via `mergeCloudWithLocal`.

---

## The one thing only you can do: keep the preview alive across sessions

The sandbox that runs this agent **reaps all background processes when a turn ends**. No in-process wrapper can change that — it's an environment-level lifecycle. So:

- During an active session, `npm start` (or the agent's background server) keeps the preview up and auto-restarts on crashes.
- **Between sessions, the preview dies unless you run it yourself.**

To keep the preview up permanently, run one of these in **your own persistent terminal / host** (not the agent's sandbox):

```bash
# Option A — simplest: a terminal you leave open
cd MindSpool-latest-
npm run build && npm start
# (npm start now auto-restarts on crash)

# Option B — pm2 (survives terminal close, restarts on reboot)
npm i -g pm2
pm2 start scripts/serve.js --name MindSpool
pm2 save && pm2 startup   # auto-restart on server reboot

# Option C — systemd (Linux host)
# /etc/systemd/system/MindSpool.service
# [Unit]
# Description=MindSpool
# [Service]
# WorkingDirectory=/path/to/MindSpool-latest-
# ExecStart=/usr/bin/node scripts/serve.js
# Restart=always
# Environment=NODE_ENV=production
# [Install]
# WantedBy=multi-user.target
```

For a hosted preview (Vercel, Render, Railway, Fly.io, a Docker container), set the start command to `node scripts/serve.js` (or just `npm start`) — the platform owns the lifecycle and restarts on crash + on deploy.

---

## Final gates (commit `b9bca18`)

| Gate | Result |
|------|--------|
| typecheck | **0 errors** |
| eslint | **0 errors / 112 warnings** (style only) |
| vitest | **68/68** |
| build | **OK** |
| npm audit | **0 vulnerabilities** |
| Chrome/Opera feed | ✅ polyfill proven |
| upvote/downvote | ✅ optimistic + IDB + mutual-exclusion + reload-persistence |
| preview crash recovery | ✅ `npm start` wrapper |

To ship: `npm run build && npm start` (run from your persistent environment).
