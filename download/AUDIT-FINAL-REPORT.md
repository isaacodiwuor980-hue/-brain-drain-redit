# MindSpool — Preview Fix & GitHub-Ready Handoff

**Branch:** `feat/community-rebuild` · **Head:** `0c51e53` · **Date:** 2026-11-16

## The preview problem — deep-debug result

**Finding: the server is not buggy.** A live production start was verified
end-to-end against `dist/server.cjs` on port 3100:

```
Server running on http://localhost:3100
GET /api/healthz   → 200
GET /              → 200  (text/html)
GET /font-loader.js→ 200  (static asset)
GET /api/feed      → 200  (API, real response logged)
```

The server starts clean, serves every surface, and stays up. So **"preview
lost" is not a code defect** — it is the sandbox reaping all background
processes when a turn ends. That is an environment-level lifecycle no
in-process wrapper can override.

### Browser-verified (the definitive test)

A `curl` 200 only proves the server answers; it does not prove the page
renders. So the running server was loaded in a real headless browser
(`agent-browser open http://localhost:3000`):

- **Title:** `MindSpool — The Next Human LLM` · **URL:** `http://localhost:3000/`
- **Page errors:** none
- **Console:** only `[preview] unregistered stale service workers` (the
  sw-killer doing its job — no warnings, no errors)
- **Rendered DOM:** `root` has 1 mounted child; `<h1>` = "Build decision
  minds"; onboarding copy + 5 buttons present; body text starts
  "Build decision minds / A mind is a short, yes/no guide…"

Both start modes were verified live: `npm run dev` (tsx, :3200) and
`npm start` (serve.js → `dist/server.cjs`, :3000) each return 200 on
`/api/healthz` and `/`, and the server is reachable via the container
hostname (not just localhost) — so a preview proxy pointing at the host
reaches it.

## The permanent fix (what actually helps after you clone)

`scripts/serve.js` is now self-sufficient. It already had a bounded
crash-restart wrapper (respawns on any non-zero exit, gives up after 12
crashes/60s so a real bug surfaces, forwards SIGINT/SIGTERM). It now also:

- **auto-builds if `dist/` is missing** — checks for `dist/server.cjs` +
  `dist/index.html` and runs `npm run build` automatically if either is
  absent. Verified: `rm -rf dist && npm start` → serve.js runs the build
  (3471 modules) → server comes up → `healthz` 200.

A fresh clone works with one command after install:

```bash
npm install
npm start          # builds if needed, then serves with crash-restart
```

For a preview that survives across sessions in your own environment, run
`npm start` from a **persistent** owner — a terminal you keep open, or a
process manager (`pm2 start npm -- start`, `systemd`, `docker compose`).
The wrapper handles crashes; the process manager handles the host lifecycle
the sandbox can't.

## GitHub-ready (verified)

| Check | Result |
|---|---|
| Tracked files | 271 (source only) |
| `dist/` tracked | 0 (gitignored) ✓ |
| `node_modules/` tracked | 0 (gitignored) ✓ |
| `.env` tracked | 0 (gitignored; `.env.example` shipped) ✓ |
| `package-lock.json` tracked | ✓ (use `npm ci` for reproducible installs) |
| Hardcoded secrets scan | none (AIza/ghp/sk patterns) ✓ |
| TODO/FIXME/stub code | none in source ✓ |
| Working tree | clean ✓ |

## Final gates (all green this session)

```
tsc --noEmit          0 errors
eslint                0 problems   (was 112 warnings — all cleaned)
vitest run            83/83 passing (14 files)
npm run build         OK
npm audit             0 vulnerabilities
production start      healthz/HTML/asset/API all 200
```

## What is genuinely still out of scope (true constraints)

- **Cross-user live-session video** — the session model is local-only
  (IndexedDB); true spectator video needs a realtime signaling backend
  (WebRTC + Supabase realtime). The spectator view now shows an honest
  status panel instead of a black box.
- **Opera Mini Extreme mode** strips all JS — no client fix exists (the
  crypto polyfill covers High-Savings/Data-savings modes).

## Commits this session
- `0c51e53` — serve.js auto-builds if dist/ missing (permanent fresh-clone fix)
- `5750361` — lint: 112 warnings → 0 (77 `any` + 34 react-hooks + 1 console)
- `efa47b4` — Redis rate limiter w/ fallback; dead OTP removed; honest spectator panel
- `c431e7c` — mission-stats lib + tests

## To export to GitHub
```bash
git remote add origin <your-repo-url>
git push -u origin feat/community-rebuild
```
Clone back with `git clone … && cd … && npm ci && npm start`.
