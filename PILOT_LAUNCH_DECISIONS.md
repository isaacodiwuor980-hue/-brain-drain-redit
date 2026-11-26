# Pilot launch decisions (40 risk questions)

Owner choices, not evidence that controls exist. These do not authorize SQL, live tests, data deletion, paid services or deployment. See `ONLINE_FIRST_PRODUCT_DECISIONS.md` for earlier decisions. Actual release requires an exact reviewed plan, verified recovery and separate approval.

## Scope and operations
1. Minimum pilot: accounts, feed reading, posting and voting **only if each passes security and data-loss checks**; unvalidated features stay disabled.
2. Up to 10 trusted testers initially; expansion requires review and approval.
3. Warn participants explicitly that the product is experimental and data may be lost.
4. Stop unsafe writes during serious security or data-loss incidents; preserve reading only if safe.
5. Owner or designated reviewer handles reports and recovery.
6. Verify recovery before launch/accepting important user data; no live migrations without a verified backup or safe restore drill per prior choice.
7. Recovery-point target: at most 24 hours of changes lost. This is a target, not a verified guarantee.
8. Recovery-time target: up to 24 hours. Actual recovery duration remains unverified.
9. Backup retention target: 30 days, subject to provider capabilities, cost and deletion obligations. Backups require separate privacy and erasure planning.
10. Incident communication: in-app notice and email where possible, avoiding unnecessary exposure.

## Identity and privacy
11. Email-based Firebase sign-in initially, only after provider configuration and recovery are verified. No inference of database ownership from email.
12. If secure new-account identity linking fails, pause signup; protected actions must fail closed, never guess a link.
13. Pause sessions/sensitive actions during suspected compromise until ownership verification; mechanisms are not yet implemented or verified.
14. First release targets adults only. A self-declaration does not independently verify age; legal and policy review still needed.
15. Explicit acceptance of reviewed privacy policy and terms, with version recorded. Policy content and enforcement remain unfinished.
16. New brains default public. **Risk:** accidental publication of sensitive content; prominently communicate the public default and provide a reliable privacy choice. User also chose detaching post links when a brain becomes private; live enforcement remains unverified.
17. Require an explicit audience choice for new posts; offer only audiences whose access controls are verified.
18. Public profiles limited to display name and public contributions; don't expose email or private activity. Other identifiers and surfaces require audit.
19. Hide a cached post once the server confirms it is deleted or private; offline devices may remain stale. Never automatically republish.
20. Hide unverified brain links; previously loaded cached post text and other sensitive details may remain visible.

## Votes, points and feed
21. One current vote per person per post, with changes/removal permitted. Cross-device ordering and secure identity remain unresolved.
22. Hide public vote counts **and individual voter identities**; carefully audit all APIs and interfaces before claiming this works. Own vote state may be needed for recovery, not public disclosure.
23. Describe weighted votes as community agreement, not verified facts. No fabricated accuracy claims.
24. Keep points changes disabled until identity and rules are verified; automatic losses remain disabled. Existing legacy points paths need audit before any pilot claim.
25. For an uncertain vote, refresh current state and ask before another change; do not replay a toggle blindly. The recovery interface is not complete.
26. Enforce blocks before ranking and audit other routes/caches, once block controls are verified.
27. Fill scarce mix slots from other eligible posts, never bypassing visibility, blocks or moderation.
28. Provide varied eligible content for cold-start users; interest is not expertise.
29. Sync opted-in interest settings across devices with opt-out and clearing; trusted identity and server privacy controls are prerequisites.
30. Provide simple, reliable explanations for feed recommendations where available; don't invent reasons.

## Safety, costs and monitoring
31. If review coverage is absent, a small pilot with disclosed limitations is the owner's preference, but do not launch where safety, legal or security gates fail. Reporter-side hiding alone is not protection for everyone.
32. Authorized staff may immediately hide imminent-harm or illegal material, with an action log and review. Roles, procedure, evidence handling and tooling remain unverified.
33. Allow appeals with human review where feasible; no response time promised without staffing.
34. Use conservative adjustable sign-up, posting and voting limits; avoid unfairly penalizing shared networks. Limits and efficacy need testing.
35. Explain a rate-limit wait and offer support; no sensitive enforcement details.
36. Minimize cost and ask before paid services. No spending or purchase authorized.
37. If safe media storage/costs aren't ready, first release is text-only; absence of verification is not a promise that every existing upload path is disabled.
38. Minimal non-content error and reliability metrics, with privacy review of identifiers, access, retention and opt-out.
39. Target 7-day identifiable operational log retention if needed and legally permitted. All sinks, provider retention and deletion obligations remain unverified.
40. Disable a seriously faulty feature promptly without deleting user content; notify users. Database rollback/deletion still needs an exact approved plan.

The selected safety limits and recovery targets are goals, not claims. Existing Supabase accounts are experimental. No live database change, deployment, content inspection or paid service is authorized by these choices. The weighted algorithm, identity bridge, moderation, privacy, vote count suppression and reliable cross-device sync are not yet production-ready.
