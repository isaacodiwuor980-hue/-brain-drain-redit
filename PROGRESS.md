# PROGRESS.md

Living checklist for this repository. Work through **one unchecked task at a
time**: test it, check it off, commit. See `AGENTS.md` (Rule 2).

Legend: `- [ ]` pending · `- [x]` done (tested + committed)

## Baseline

- [x] Vendor the arena skill into `.skills/arena` and ignore `.arena/` (commit `c2cd8f8`)
- [x] Add `AGENTS.md` agent rules and this `PROGRESS.md` checklist
- [ ] Install dependencies and run the full gate suite: `npm ci && npm run typecheck && npm test && npm run build` — record results below
- [ ] Record baseline results here: typecheck: _pending_, tests: _pending_ (57 expected), build: _pending_

## Testing

- [ ] Expand e2e coverage beyond `tests/e2e/feed.spec.ts` — add critical flows: onboarding, mind create/edit, share
- [ ] Run the smoke suite (`scripts/feature-smoke-test.ts`) against a live server and fix any failures
- [ ] Run the load test (`k6 run scripts/load-test.js`) and record the results

## Code health

- [ ] Audit every route in `api-server/src/routes/` for zod validation + a rate-limit tier + JSON errors via `lib/http-errors.ts`
- [ ] Verify all local-first writes succeed offline (airplane-mode pass over every IndexedDB-backed mutation)
- [ ] Re-check the first-load budget (~193 KB gzip eager chunk): inspect `dist/index.html` after recent dependency changes; fix `manualChunks` in `vite.config.ts` if a new eager chunk appears
- [ ] Confirm service-worker safety: `/sw-killer.js` present in `index.html`, no SW registration anywhere

## Security & operations

- [ ] Security pass: CSP/HSTS/X-Frame-Options headers, auth on every `/api/*` route, no stack traces in responses
- [ ] Review `scripts/backup-supabase.sh` — take a fresh backup and verify a restore drill
- [ ] Update `README.md` / `CHANGELOG.md` to reflect the current release state
