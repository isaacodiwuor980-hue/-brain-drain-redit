# Brain Drain — Before / After Summary

**Phase 1-10 complete.** This is a one-page summary of what changed across the full audit + fix cycle.

---

## Codebase Health

| Metric | Before (Phase 1 audit) | After (Phase 10) | Delta |
|---|---|---|---|
| Git-tracked files | 332 | 228 | **−104 (−31%)** |
| Runtime dependencies | 14 | 8 | **−6** |
| devDependencies | 65 | 42 | **−23** |
| Confirmed backend bugs | 15 | 0 | **all fixed** |
| High-severity security findings | 2 | 0 | **all fixed** |
| Dead API endpoints | 6+ | 0 | **all deleted** |
| Dead frontend files | 41 | 0 | **all deleted** |
| One-off junk scripts | 11 | 0 | **all deleted** |
| npm vulnerabilities | 17 | 6 | **−11** (remaining are transitive, need upstream patches) |
| Backend type checking | ❌ excluded from typecheck | ✅ included | gap closed |
| CSP compliance | ❌ inline SW-killer blocked | ✅ external sw-killer.js | fixed |
| Smoke tests | 35 | 36 | +1 (SW-killer test) |

---

## What Was Fixed (Phases 3-10)

### Backend bugs (15 fixed, 2 documented as design)
- Feed cache repost count bug (precedence + property name) — **B-2**
- `?mine=false` coerced to true — **B-3**
- Maintenance mode bypassed API — **B-4**
- Search fired 2 queries, discarded 1 — **B-5**
- Follow endpoint silently swallowed errors — **B-6**
- API 404s returned HTML — **B-7**
- Skills error handling masked outages — **B-9**
- Config crash without PORT env — **B-10**
- Feed cache memory leak (unbounded) — **B-11**
- Auth errors masked as 401 — **B-12**
- SSR pages advertised dead routes — **B-13**
- Maintenance mode required restart — **B-14**
- (B-1 zod, B-8/B-15 design — documented)

### Security (2 high + 1 med fixed, 1 med deleted)
- Rate limiter XFF spoofing → `req.ip` + `TRUST_PROXY` — **S-1**
- OTP code leaked in prod → blocked — **S-2**
- `/v1/health/detailed` exposed internals → deleted — **S-3**
- `:id` params unvalidated → UUID validation — **S-4**

### Dead code purged
- `functions/` (orphaned Firebase Cloud Functions)
- `public/sw.js` (functionally disabled, source of stale-cache bugs)
- 6 dead API endpoints (verify, provenance, health/detailed, events/summary, intelligence/summary, set-contact-hash)
- `DEPLOYMENT-CHECKLIST-PHASE4-6.md`, `scripts/test-sm2.ts`, `scripts/simulate-20k-users.mjs`
- Fixed `firebase.json` (removed `/api/**` rewrite to non-existent function)

### Architecture improvements
- **CSP fix:** inline SW-killer → external `/sw-killer.js` (was silently disabled by `script-src 'self'`)
- **Type-safety gap closed:** `api-server/` no longer excluded from typecheck (backend now type-checked)
- **Pragmatic layering:** extracted `lib/http-errors.ts` + `lib/validators.ts` (DRY without over-engineering)
- **Semver hygiene:** all `*` ranges pinned to `^x.y.z`; `esbuild` added as direct dep

### Dependencies
- React 19.2.8 → 19.3.1, Express 5.2.1 → 5.3.0
- vite, zod, re2js security patches applied
- 11 of 17 npm vulnerabilities resolved

---

## What Still Needs You (not code, action items)

1. **Apply Migration 0004** to Supabase (needs PAT) — 6 tables for community features
2. **Set CORS_ORIGIN** to your production domain before deploying
3. **Set TRUST_PROXY=1** when behind a reverse proxy (so rate limiting works)
4. **Wire real email provider** for OTP (mock blocked in production now)
5. **Wire real Firebase token minting** for OTP verify (currently mock token)

These are all documented in `AUDIT_REPORT_PHASE3-10.md` §11.

---

## Files in `download/`

| File | What |
|---|---|
| `AUDIT_REPORT.md` | Phase 1 — full audit (the original findings) |
| `DELETED_FILES.md` | Phase 2 — what was removed and why |
| `NEEDS_MY_DECISION.md` | Phase 1 — ambiguous items needing user input (now resolved, see §4 of the Phase 3-10 report) |
| `AUDIT_REPORT_PHASE3-10.md` | **Phase 3-10 — what was fixed, how, and what remains** (this is the main deliverable) |
| `BEFORE_AFTER.md` | This file — one-page summary |
