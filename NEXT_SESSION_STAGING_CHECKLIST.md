## Before you begin (the user must do these, not the agent)

- Create or designate an isolated staging Supabase project, clearly separated from production, and confirm its identity and scope. Do not use production data.
- Provide two disposable Firebase-authenticated test accounts, User A and User B, in a separate test setup, and an unmapped test subject as needed. An application admin is not a database service role. Do not place account credentials in chat.
- Verify backup and restore procedures for any database whose schema or data may be affected. No destructive operation is authorized by this checklist.
- Arrange an approved secure method for staging configuration; never put passwords, tokens, service-role keys or connection strings in chat, committed files or logs.
- Explicitly authorize the exact staging operations in writing before execution. The agent must independently confirm the target is the authorized staging project.

## Pre-migration review (agent, before applying anything)

- Read `supabase/migrations/0001_initial_schema.sql` through `0009_reaction_preview.sql` in order; review dependencies, existing migration history, schema, extension privileges, rollback and backup implications. Do not assume `IF NOT EXISTS` corrects incompatible objects.
- `0002_search.sql:19` explicitly creates `vector`; check actual extension availability, existing installation and privileges in staging. Its outer `DO $$` and inner function body both use `$$`; review and resolve the suspected delimiter/syntax issue through a separately authorized fix before application. The comment claiming graceful fallback is not established.
- `0004_community_rebuild.sql:242–244` uses `now()` in a partial-index predicate; review PostgreSQL immutability requirements and any other migration blockers before application. Existing policies, triggers, grants, data and schema may also affect repeatability.
- Capture sanitized baseline table, function, column, constraint, policy, grant, trigger, index and migration-state inventories. Report pgvector availability and installation status. Record no user data, credentials or full identifiers. Do not proceed with unresolved migration issues merely because this document lists the chain.

## Session plan (evidence per step, one STAGING_VERIFICATION.md commit per completed step, not one commit per database operation)

For each step record sanitized commands, intended contracts and actual results in `STAGING_VERIFICATION.md`. Commit evidence for a completed step if it changes the repository; do not create empty commits or imply a database change is version-controlled. A separate reviewed session is required for code or migration fixes. Stop if prerequisites cannot be met.

1. **Operational — isolated staging:** Confirm target, explicit scope/authorization and backup/restore. Evidence: non-secret project identity, confirmation and restore verification; production stays untouched.
2. **Technical — prerequisites:** Complete the pre-migration review above for migrations 0001–0009, including 0002 pgvector/nested quoting and 0004 partial-index predicate. Evidence: compatibility assessment and reviewed resolution of blockers before any application.
3. **Technical/operational — migrations:** Apply only reviewed, authorized and unapplied migrations in dependency order, after checking migration state. Capture sanitized table, column, function, policy, grants and migration-state inventories before and after each migration. Stop immediately on failure and document transaction/partial-application state. Do not apply 0005 or 0009 a second time merely because later steps test them.
4. **Technical — RLS/authorization:** `0005` and `0009` add functions, not tables. `0007` adds `user_identity_map` and `server_feature_flags`; `0006` adds TSRG tables, also requiring review. Inspect each table's RLS flag, policies, grants, owners and role inheritance. Test anon, User A and User B authenticated non-owner roles and service_role against each intended contract: 0007 tables are service-only, not user-owned rows. Test other private tables for cross-user isolation and intended public tables for their published contract. Verify function execution restrictions and test API authorization separately: the backend intentionally uses service_role, which bypasses RLS. A browser receiving a service-role credential or an API using it without adequate authorization is a stop, not backend use by itself. Evidence: sanitized per-role outcomes.
5. **Technical/operational — identity:** Using an approved proof-of-ownership provisioning process, map two disposable Firebase subjects to the correct Supabase UUIDs in `user_identity_map`; never infer from email. Test `GET /api/me` for A and B and an unmapped subject. Evidence: sanitized results, no full identifiers or tokens. Existing routes are not automatically fixed by these records.
6. **Technical/approval — brain identity precondition:** Local brain routes now resolve a verified mapping to a Supabase UUID for protected operations. Review the implementation, provisioning coverage, existing-data ownership and failure behavior; other API routes still need auditing. Record BLOCKED if integration or rollout has not been reviewed and validated. Unmapped users fail closed; do not infer success for UUID-shaped Firebase IDs.
7. **Technical — concurrent brain saves:** After 0005 has been applied once in step 3 and step 6 has been reviewed and validated, use two independent authenticated sessions and disposable records to race saves to the same brain ID. Derive HTTP/status expectations from actual reviewed code; verify ownership and transaction rollback/no partial nodes. Use modest concurrency. Evidence: sanitized responses and final persisted state. If blocked, do not fabricate results.
8. **Technical — reaction preview:** On isolated disposable data, compare `0009`'s read-only preview with subsequent `0008` desired-state setter outcomes under a controlled snapshot. Confirm preview makes no writes. It does not model the ordinary toggle route or tier changes and returns no useful concurrency token; this does not prove shadow safety. Never call a mutating RPC as a live shadow on user data. Evidence: sanitized inputs/outcomes and unchanged pre-write state.
9. **Technical — tests:** Run the local suite and separately identified staging integration tests. Identify tests that still use PGlite or mocks and list coverage gaps. Evidence: exact sanitized commands, counts and results.
10. **Legal/privacy and operational — decisions:** Obtain decisions and appropriate review for retention, complete export/deletion, content licensing, privacy/terms claims, backup/restore and user data handling. `pages/SettingsPage.tsx` provides local-only actions; `public/privacy-policy.html` exists but its claims are not verified. Evidence: documented sign-off and scope, not a claim of legal compliance based on code.
11. **Operational — report:** Finish `STAGING_VERIFICATION.md` with non-secret commands, evidence, results, schema differences, deviations and blockers. Final line must be `Staging verification: COMPLETE` only if all required checks actually pass, otherwise `Staging verification: BLOCKED at step N because …`. This is not production clearance.

## Stop conditions

- Staging identity, authorization or verified backup/restore is missing; stop before any database change.
- Any migration fails or schema/history differs materially from the reviewed expectation; stop and report sanitized error, known partial state and a proposed separately reviewed fix. Do not modify or silently retry an applied migration.
- A table or endpoint exposes cross-user data contrary to its intended contract, a browser receives service-role credentials, or a service-role API path lacks necessary authorization.
- A concurrent-writer, ownership, identity or rollback test violates its documented expectation.
- Credentials or private data would appear in logs or artifacts; stop, contain the exposure and follow the applicable incident procedure without repeating the secret.

## What the agent must NOT do during staging verification

- Do not modify an applied migration, add features, enable flags, touch production or use production data.
- Do not expose credentials, full identifiers or private data. Do not infer identity from email.
- Do not make further identity code changes without explicit authorization and review.
- Do not call mutating RPCs as live shadows or equate backend service-role access with user authorization.
- Do not claim COMPLETE before the evidence report exists, or treat staging success as production clearance.
