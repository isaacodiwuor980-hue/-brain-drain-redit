# Concurrent-writer test plan (not a production test)

Status: UNVERIFIED for the live service. Existing isolated tests described in `PRIVACY_ISOLATED_TESTS.md` and the points test script are narrower; they do not establish live RLS or cover every writer.

1. Obtain explicit permission and use a disposable, isolated PostgreSQL environment with reviewed schema and synthetic accounts only. Never aim load tests at the live project under the current read-only authorization.
2. Record the schema revision, roles, initial synthetic state, commands and expected invariants without logging credentials or personal data.
3. For each reviewed write operation, issue simultaneous conflicting writes from separate database connections, with a synchronization barrier. Repeat enough times to detect races; check final rows and every response, not just successful requests.
4. Verify the intended uniqueness, ownership, nonnegative balances and transaction atomicity for the specific operation. Include failures and retries. Verify no partial write or cross-user change occurred.
5. Run negative authorization cases with actual restricted user roles, not service role. Preserve only aggregate results and clean up the disposable environment after approval.

Passing such a test reduces uncertainty but does not prove all schedules safe. Do not run the proposed points test against real balances or enable staking.
