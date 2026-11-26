# Further pilot implementation choices

Product choices, not claims that the feature is implemented or production-safe. No live migration, deployment or data deletion is authorized by these choices. Earlier choices, including recovery and explicit approval gates, still apply.

1. Offline composer action saves a draft rather than implying publication.
2. After reconnecting, the owner must review and explicitly publish the draft.
3. Do not automatically expire unpublished drafts; browser storage can still be cleared or lost.
4. Say clearly if a draft exists only on the device and is not server-backed.
5. Show a stale/offline banner for cached public feed content.
6. If private-post authorization isn't validated, public-only posting is acceptable with an explicit audience choice. Do not offer unenforced private options.
7. Warn clearly before creation that a new brain defaults to public.
8. Detached brain-post links do not automatically return if a brain becomes public again; require explicit new attachment.
9. Blocking should hide content in both directions, but only offer it as protection when enforced across routes and caches.
10. Authorized reviewers may access the specific reported content for investigation, with limited access and auditing.
11. When a post is deleted, hide the post and its comment thread. Actual retention/deletion remains subject to a reviewed policy and approvals.
12. Provide a seven-day cancellation window for account deletion. Design secure delayed execution, privacy, reauthentication and explicit confirmation; this choice does not authorize deletion. Follow earlier points-history erasure decision when deletion is actually performed.
13. Give a blocked person only a generic access message, not a direct identification of who blocked them.
14. Uncertain automated spam detection should not hide content for everyone without review; suspicion is not proof.
15. Require an adults-only declaration. This does not independently verify age or replace legal review.
16. The chronological fallback shows most recently published eligible posts first, with stable tie-breaking and privacy/moderation checks.
17. Avoid immediate duplicates between feed pages where possible; cursor behavior under concurrent changes needs testing.
18. Keep behavioral interest learning off initially. Explicit follows and verified controls can be considered separately; opt-out and clearing requirements still apply.
19. When a pilot participant leaves, retain their unsynced drafts account-scoped until they choose, while explaining device-storage limitations. Do not silently erase work.
20. If a safety test fails, consider a smaller launch scope only where every remaining feature independently meets all gates. Recovery remains a gate; no separate live approval is waived.

Detailed requirements and current evidence are in `ONLINE_FIRST_PRODUCT_DECISIONS.md`, `PILOT_LAUNCH_DECISIONS.md`, `TSRG_LAUNCH_BLOCKER_DECISIONS.md` and `FEED_PROGRESS_LOG.md`.
