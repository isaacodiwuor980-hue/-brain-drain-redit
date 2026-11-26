# Identity, cross-device voting and TSRG: migration requirements

The owner's 20 decisions are recorded here as requirements, **not an approved migration, implemented features or evidence of production readiness**. The target is the current connected Supabase project. Exact SQL, backup/recovery, impact and rollback need separate review and approval before live changes. No content, keys or account records were inspected for these decisions.

## Secure identity
1. Show a setup-in-progress message while trusted provisioning is incomplete; block protected actions until the link is confirmed.
2. Permit a retry only after trusted provisioning is idempotent and tested; do not duplicate, guess, reassign or infer a mapping from email/client data.
3. After deletion, a later signup is a new account, not an automatically restored database identity. Existing experimental accounts remain unlinked without separately approved ownership verification.
4. Require recent sign-in within five minutes for sensitive operations such as deletion or email changes. Server enforcement, revocation and the exact action inventory remain to be designed and tested.
5. Keep long-incomplete partial accounts blocked and offer support; do not automatically delete them.

## Vote recovery and devices
6. If connectivity drops during submission, show **pending verification**, not confirmed or failed. A browser online flag does not prove whether the server committed.
7. Show only the person's server-confirmed vote selection when they open the post; hide public and author totals and others' voter identities. Verify access before returning own state.
8. For an ambiguous held offline toggle, show the current state and let the owner choose; do not infer or automatically replay the original action. Complete account-scoped recovery UI remains absent.
9. To switch direction, remove the existing vote first, then choose the other in a separate step. One current vote per post. Both steps need server-side authorization, version checks, idempotence and recovery; do not implement as a client-only rule. **Known mismatch:** the review-only 0023 CAS prototype currently allows a direct upvote-to-downvote change, as its synthetic test demonstrates. It is not compliant with this decision and must not be deployed as-is. All old writers, privileged functions and older clients must also be stopped or made compliant; 0024 alone is insufficient.
10. Unsynced drafts must not be represented as present on other devices; mark them device-only. Local storage can be lost or accessed by others with device access.

## TSRG
11. Tier-weighted voting stays off when eligibility isn't securely verified. Do not claim votes establish factual truth or enable automatic losses.
12. Do not collect shadow-evaluation fields until the exact field list and privacy plan are reviewed. Earlier decisions require minimal non-content operational information and privacy controls; no shadow collection approval is implied.
13. When personalization is eventually validated, let users choose chronological ordering as well; both must enforce visibility, blocks and moderation. Behavioral interest learning remains off initially.
14. Stop using challenged or withdrawn expertise evidence in future calculations until human review, without automatic penalties. Human evidence review, provenance and any recalculation/rollback remain unresolved; public expertise labels and confidence displays remain disabled.
15. On missing or contradictory shadow data, keep ranking off and investigate. Shadow evaluation is not authorization to enable live ranking.

## Rollout and failure
16. Old clients unable to meet new security rules must be blocked from protected actions by the server and asked to update. Server enforcement and handling privileged/legacy writers are prerequisites, not a client flag.
17. Explicitly tell pilot testers when features are unavailable; do not silently weaken authorization.
18. If schema or experimental records conflict with the migration assumptions, stop, protect existing data and show aggregate/redacted findings for review. Do not automatically repair, relink or delete.
19. If reconnecting does not resolve a pending action, notify the user promptly that it needs attention; do not silently replay an uncertain vote.
20. If post-deployment checks find privacy or data-loss risk, stop the affected feature and notify the owner; pause wider access if needed. Preserve data and evidence. Restores or data deletions require their own exact approval.

## Major unresolved gates

- Provider recovery and dependencies have not been verified; a listed backup is not a restore drill. The owner requested skipping backup questions, not waiving the recovery gate.
- Trusted new-account identity provisioning, server-side freshness, collision handling and old-client enforcement are not complete.
- Vote operation identity proof, all-writer enforcement, two-step switching, bootstrap, version retrieval, pending-state UI, receipts, retention, account deletion and live permissions are not complete. Local SQL experiments cannot be treated as live migrations.
- Counts are hidden in selected local UI controls only. API, database, caches, comment and other paths can still expose them.
- The safe chronological fallback, moderation/block enforcement, TSRG ranking/authority, privacy and reliable cross-device sync are not ready or verified end-to-end.

## Additional scope choices
- Two-step remove-then-select applies to post votes, comment votes and switching House/Mouth classifications. Requires separate safe server-side enforcement for each writer and operation, not simply a UI rule.
- Pilot target includes web and native mobile. A shallow repository search found no Capacitor config or native iOS/Android directory at depth two; this is not a complete native-app audit. Native builds, distribution, session/storage isolation and mobile cross-device behavior remain unverified. Do not claim native apps exist or are production-ready.
- Prepare low-cost hosting options for application and API; user did not authorize hosting purchases, resource creation or deployment. Accurate cost and operational claims require provider verification.
- On review, a person may explicitly discard only an ambiguous local pending reaction with a warning and confirmation; this must not alter their server vote. The account-scoped recovery interface and safe storage are not implemented.
