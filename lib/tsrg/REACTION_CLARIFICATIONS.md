# Questions and brainstorming for an independent AI or engineering review

This document is a review request, not evidence of an external review. No external AI was contacted. The current reaction route remains unchanged; migration 0008 is local and un-deployed.

## Questions to clarify

1. **What is the desired operation?** The existing user action is a toggle: clicking the same vote removes it. The new RPC sets a requested value and is idempotent for repeated identical calls, but cannot represent removal. Should a future API accept `upvote`, `downvote`, `repost`, and explicit removal of each independent category, rather than infer toggle semantics? How should existing clients migrate without changing their behavior?
2. **What does shadow mode compare?** Should it use a read-only simulation against a captured pre-write snapshot, a separate isolated shadow database, or a transaction explicitly rolled back? A second write on live tables can change user data even if the setter is idempotent: a delayed `upvote` can overwrite a later `downvote`, and setting an upvote after a same-vote toggle-off resurrects it. Can the design prove zero writes to real user data?
3. **How are concurrent actions ordered?** What stable operation ID, precondition/version or event sequence identifies a user intent? How are retries, delayed messages, stale snapshots, duplicate IDs and concurrent clients handled? Per-user/post advisory locks only serialize writers that participate in that same locking convention; the current REST writes do not.
4. **What counts as divergence?** Specify the pre-write inputs, expected result including removals and independent reposts, read isolation, comparison window, race classification, sample coverage and denominator. A seven-day run with no comparable events is not evidence of zero divergence. Use aggregate counts and sanitized error categories rather than raw tokens, post content, full IDs or upstream errors.
5. **Identity mapping lifecycle:** How will Firebase subjects be provisioned to Supabase UUIDs after proof of ownership? What happens to unmapped, legacy, merged, deleted and restored accounts? How will staging active-user coverage be measured without exposing identifiers? Mapping by email alone is unsafe.
6. **Data model and migration:** Reactions currently have a uniqueness constraint per type, so legacy data can contain both an upvote and downvote. What safe repair policy handles conflicting rows? Are a unique per-vote constraint or additional version columns warranted, and what are the backup and rollback plans? Reposts are independent. Any schema constraint needs verified existing data first.
7. **Endpoint contract:** `GET /api/me` returns the mapped Supabase UUID, not the Firebase subject; unmapped authenticated callers get 401 as requested, while lookup outages get 503. Is 401 preferred over 403 for an authenticated but unmapped caller? The response must not be publicly cached. Should future integrations expose any identity at all?
8. **Release criteria:** Which isolated PostgreSQL/Supabase staging tests, privileges, independent concurrent sessions, mapping coverage, failure injection and observability thresholds are required? Define a seven-day shadow comparison window with meaningful coverage and zero unexplained divergences before considering replacement. PGlite and mocked HTTP tests are not production evidence.

## Review options and tradeoffs

- **Pure simulation:** compute expected state without touching data. Simple and safe, but can diverge from SQL and needs captured inputs and parity tests.
- **Isolated staging/shadow database:** exercise real SQL without modifying user rows. Requires consistent snapshots, strict isolation, safe test data and deployment controls.
- **Rollback-only database transaction:** exercises write constraints but must guarantee rollback at the database boundary; verify side effects such as sequences and external triggers, locking impact, and isolation. Never rely on a client crash or a second compensating write.
- **Production dual-write:** not recommended; idempotency alone does not protect ordering, removal semantics, or users from stale writes.

Please critique the assumptions above, identify additional failure modes, and propose a minimal, testable design. Do not assert a 100% safety guarantee or assume production/staging access.
