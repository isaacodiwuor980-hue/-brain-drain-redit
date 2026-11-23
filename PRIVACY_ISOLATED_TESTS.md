# Isolated privacy tests

These checks use synthetic events and fake account UUIDs. **Never point them at Supabase, production, staging with user data, or a shared PostgreSQL cluster.** They do not delete server-stored analytics or prove end-to-end production privacy.

## Verified result in this workspace

- `scripts/test/privacy-browser.mjs` passed with headless Chromium 143 and two tabs in the same browser context against a local Vite fixture. It exercised the actual browser IndexedDB transactions and storage notifications, showed that switching off in one tab prevents another tab from recording/using/sending the tested queued events, and cleared the synthetic IndexedDB events. All non-local requests were blocked and the event endpoint was intercepted. The fixture calls the app's privacy/analytics modules directly: it does **not** exercise the real Settings UI, real API, multiple browser profiles, Safari/Firefox, storage reset races, page termination, or requests already received by a server.
- `scripts/test/privacy-postgres-concurrency.mjs` passed on PostgreSQL 17.12 in a dedicated local socket-only test cluster. It created a randomly named empty database containing only synthetic data, installed the proposal, observed **50 independent blocked connections** behind opt-out, then **50 behind clear**, committed the locking operation and checked all stale writes were rejected. It also tested a blocked writer against a flag update and two basic untrusted-role permission denials. The temporary test database was dropped after testing. This is not Supabase, actual Firebase auth, effective real production RLS, an API integration, staging migration compatibility, or a proof of all schedules and failure modes.
- Both scripts are separate manual checks and are **not** part of Vitest or CI. PostgreSQL/Vite test processes were stopped after testing. No live database was read or written by these scripts.

## Running the browser fixture

Install project dependencies with `npm ci`. Provide a trusted local Chromium binary compatible with Playwright and a local test-only Vite server. The browser script hardcodes `http://127.0.0.1:4178`, blocks external browser requests, and intercepts `/api/events`.

```sh
# In a separate terminal: fixture only, no connected application/API server
VITE_LOCAL_ONLY=1 VITE_ENABLE_ANALYTICS=1 npx vite --host 127.0.0.1 --port 4178 --strictPort
# In another terminal
CHROMIUM_PATH=/path/to/local/chromium node scripts/test/privacy-browser.mjs
```

In this sandbox Chromium was supplied by temporary npm package `@sparticuz/chromium@143.0.0`; missing NSS/NSPR libraries were compiled in ignored `.cache` from GitHub source. A full NSS tool build did not complete because zlib development headers were absent, but the required shared libraries compiled and Chromium ran. Temporary binaries/dependencies are not committed. Browser tests require installed OS libraries and suitable executable settings; do not use `--no-sandbox` outside an appropriately isolated test environment.

## Running PostgreSQL concurrency checks

The script **only** accepts a local Unix socket in `.cache/pg-local/socket`, port 55439, and verifies that the connected server uses the dedicated `.cache/pg-local/data` directory with TCP listening disabled before creating its temporary database. It requires a disposable local superuser cluster under that path; its global synthetic roles may remain until that disposable cluster is discarded. Verify the directory is yours and contains no valuable data before initializing it. Never repoint that directory at an existing cluster or real data. The cluster's local trust authentication is for isolated tests only.

In this workspace the temporary server was PostgreSQL 17.12 from npm package `@embedded-postgres/linux-x64@17.12.0-beta.19`, initialized under the ignored `.cache` directory and started with `listen_addresses=''`, a user-only Unix socket, and port 55439. Then:

```sh
node scripts/test/privacy-postgres-concurrency.mjs
```

The binary, data directory and runtime dependencies are temporary and excluded from the repository. Setup and cleanup must be carried out by an operator familiar with local PostgreSQL; verify a cluster is disposable before removing it. A separate staging environment with representative schema and appropriate security controls remains necessary.

## Points reservation concurrency (separate proposal)

On the same dedicated local PostgreSQL 17 cluster, `node scripts/test/points-postgres-concurrency.mjs` creates and drops a fresh synthetic database after checking the same socket/data-directory/TCP restrictions. The observed test covers 50 concurrent wallet opens, 50 competing reservations, and 50 identical retries each of reservation and release. It is manual, not CI, and does not test live Supabase, all transaction schedules, tiered voting, burning, account deletion or API ownership. See `FEED_SUPABASE_PLAN.md` for production blockers.
