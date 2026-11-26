# NEEDS_MY_DECISION.md — Ambiguous Items (NOT touched, per your Rule 4)

These items are ambiguous: they might be used by something outside this repo (a deployed Firebase project, the z.ai hosting platform, app-store listings, or your future plans). I did **not** delete or change any of them. Tell me your call on each and I'll execute it.

---

## 1. `functions/` — orphaned Firebase Cloud Functions (lean: delete)

**What:** 2 Cloud Functions — `cleanupOrphanedSessions` (pubsub every 5 min) + `onChallengeAttemptComplete` (Firestore trigger) — with their own package.json/tsconfig.

**Why ambiguous:** Nothing in the app writes to the Firestore collections they serve (`realtime_sessions`, `user_challenge_attempts`, `reputation`, `user_challenge achievements`) — the frontend writes those to IndexedDB only. No script/CI/README deploys them. BUT if the Firebase project still has them deployed, deleting the source only matters next time someone runs `firebase deploy`.

**⚠️ Related hazard (I recommend fixing regardless):** `firebase.json` contains `{"source": "/api/**", "function": "api"}` — a rewrite to a function named `api` that **does not exist**. Anyone deploying Firebase Hosting from this repo would break the API path. The Express server owns `/api`.

**Options:** (a) delete `functions/` + the firebase.json functions block + stale rewrite → repo becomes Firebase-Hosting-safe; (b) keep if the Firebase project still runs the cron.

---

## 2. `metadata.json` — z.ai applet manifest (lean: keep)

6-line platform manifest (`majorCapabilities: SERVER_SIDE_GEMINI_API`). Unreferenced inside the repo, but this workspace is a hosted applet — the platform may require it. **Recommend keep** unless you know the platform doesn't need it.

---

## 3. Uncalled API endpoints — 17 of 62 (mixed)

No frontend caller exists today. Three groups:

**a) Truly dead (lean: delete in Phase 3):**
- `GET /api/events/summary` — ops introspection, never called
- `GET /api/intelligence/summary` — same
- `GET /api/v1/health/detailed` — **also a security finding** (exposes memory/env/flags publicly)
- `POST /api/discover/set-contact-hash` — the WRITE side of contact matching is never called, so the whole phone/email matching feature has nothing to match against (either wire it up or the `by-contacts`/`by-emails` reads are half-features)

**b) 501 stubs (lean: delete or implement):**
- `GET /api/v1/verify/:userId`, `GET /api/v1/provenance/:recordId` — return 501; also advertised in `llms.txt`/`/data-quality` SSR pages that link to non-existent routes

**c) Future/contract surface (lean: keep, clearly separated):**
- `GET /api/v1/datasets`, `GET /api/v1/search` — "AI labs data contract" (datasets returns real data, search returns empty placeholder)
- `GET /api/v1/skills` + `/skills/:id` + `DELETE /skills/:id`, `GET /api/v1/habits` + `/:id` + `DELETE /:id` — read/delete halves exist, frontend only uses PUT + search
- `GET /api/recommendations/minds` — server-side recommendations, frontend does it locally

---

## 4. `public/sw.js` — service worker (functionally disabled, still shipped)

The app actively **unregisters** service workers (today's SW-killer). But `sw.js` is still shipped in public/ and referenced by `firebase.json` headers + `scripts/feature-smoke-test.ts`. Deleting it means cleaning those two refs. **Recommend delete in Phase 3** (it's dead weight and was the source of months of stale-cache bugs), but confirm no other deployment serves it.

---

## 5. Historical / legal / utility files

| File | Question |
|---|---|
| `DEPLOYMENT-CHECKLIST-PHASE4-6.md` | Historical phase checklist — content already applied elsewhere. Delete? |
| `public/terms-of-service.html`, `public/privacy-policy.html` | Not linked in-app, but legal pages are often linked from app-store listings / external docs. Keep? |
| `scripts/test-sm2.ts` | One-off manual sanity check duplicating the SM-2 algorithm inline (the real tests live in the vitest suite). Delete? |
| `scripts/feature-smoke-test.ts` | Manual smoke script (`tsx scripts/feature-smoke-test.ts`). Not in CI. Keep as a dev tool? |
| `scripts/simulate-20k-users.mjs` | Synthetic persona "simulation" — not a real load test (load-test.js with k6 is the real one). Delete? |
| `scripts/apply-migration-0004.ts` | One-shot migration applier for the unapplied migration 0004. Delete **after** the migration is applied? |

---

## 6. Design decisions with security implications (Phase 3 will need your call)

1. **OTP mock delivery** — `/api/auth/otp/request` returns the 6-digit code in the response body (S-2, High). Keep until a real email provider lands, or kill the mock in production builds (`NODE_ENV=production` → never return the code)?
2. **Rate-limit keying** — fix to socket address + configurable trusted-proxy hops (S-1, High). Any opinion on expected deployment topology (behind a proxy or direct)?
3. **Migration 0004** — still not applied to Supabase (needs a Personal Access Token). The 13 onboarding/personality/experts/mentors/recall endpoints degrade gracefully (404 table missing) until applied. Apply when you can provide the token.
4. **`MAINTENANCE_MODE`** — currently read once at boot; docs say "use during incidents". Make it hot-reload (check per request) in Phase 3?

---

## 7. Known limitations I will NOT "fix" without your direction (they're design, not bugs)

- In-memory rate limiter / feed cache / OTP HMAC key assume a **single instance** — scaling with `docker-compose --scale` breaks them silently. Fixing means Redis or similar — say the word.
- Recall "anti-tamper" is client-controlled (`sm2StateBefore` supplied by client). Making it truly server-authoritative changes the API contract.
- `X-Frame-Options: ALLOWALL` + permissive CSP `frame-ancestors` are deliberate for the z.ai iframe preview — tightening breaks the preview. Confirm before any change.
