# Authorization, sync and feed clarifications

These are the owner's product/safety choices, not proof of implementation. Existing constraints—including recovery, migration approvals, no automatic uncertain-vote replay, private vote totals, and account isolation—remain in force.

1. If identity verification is unavailable, pause protected actions and explain. Network state is not identity proof.
2. When access is confirmed lost, hide the affected content and show a generic unavailable message; do not disclose sensitive details.
3. Do not reveal whether a private item exists in access-denied messages.
4. Do not automatically include content from unlinked experimental accounts in the pilot; no account or content repair is authorized.
5. On an account switch, stop new sends under the old account; an in-flight request may still complete and must be shown as uncertain. Never transfer work to the new account.
6. If an uncertain post is verified saved on the trusted server under the correct account, mark it saved without reposting.
7. If save status cannot be determined, retain the local draft and warn; do not automatically repost or discard.
8. Use generic sync-problem notifications without post content or sensitive details on shared screens.
9. If local draft storage fails, warn immediately and keep the editor open; never claim an unsaved draft was saved.
10. Do not send an account's pending work in the background while signed out. Resume only under the correct account and prior safety/review rules.
11. If requester visibility cannot be verified, serve no unverified candidates. A cached allow decision is not necessarily current authorization.
12. Remember a chronological-order preference on the device; no claim of cross-device synchronization.
13. Exclude posts without a verified topic from the chronological fallback until classified. This is an explicit owner choice, not a fairness guarantee; monitor the risk of excluding legitimate content after deployment approval.
14. If no reliable reason for a recommendation is available, show only a clearly generic feed explanation, never an invented specific reason.
15. If opted-in interests cannot be retrieved, do not assume old interests; use the safe fallback. Behavioral learning remains off initially.
16. For identity support, request a minimal description; never request passwords, tokens, keys or unnecessary private content.
17. Matching email alone is not ownership proof. Inconclusive recovery remains blocked.
18. Hosting limit alerts go to the owner or designated administrator. Actual monitoring and alert delivery remain unverified.
19. A feature disabled after a safety incident must not re-enable automatically; verify the fix and obtain review and approval first.
20. If safeguards remain incomplete, keep the affected feature disabled; other features must independently satisfy all gates before any separately approved release.

`lib/tsrg/chronological-fallback-v1.ts` is an offline ordering experiment: its synthetic caller-supplied allow/topic flags do **not** enforce real authorization, moderation, blocks or verified topic provenance. It is not wired to the app and has no cursor, freshness, distributed consistency or database integration. Do not treat it as the safe live fallback.
