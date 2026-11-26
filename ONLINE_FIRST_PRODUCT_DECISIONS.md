# Online-first product decisions

These are the owner's product choices, not proof that the features exist, function correctly, are secure, or are deployed. Current limitations and rollout checks are in `FEED_PROGRESS_LOG.md` and `CURRENT_PROJECT_PRODUCTION_ROLLOUT.md`. Exact production writes and deployment require separate approval.

1. **Offline reading:** show recent cached feed with a clear stale/offline indication. Cached details can remain sensitive or stale; the owner earlier chose hiding unverified brain links while retaining cached posts. Existing partial implementation does not cover every stale path or embedded content.
2. **Offline posts without a valid server-issued permit:** keep a local draft for review when online; do not publish automatically. The 30-day permit starts at issuance in the current *unwired experiment*, not at offline composition; availability and UX are unfinished.
3. **Offline reactions:** require internet; disable vote actions offline rather than imply they synced. The existing safety hold for ambiguous reactions must remain until a secure, idempotent, versioned live operation and recovery path are validated.
4. **Offline brain editing:** local drafts; when versions conflict, preserve both and ask for review. No automatic overwrite. Isolation, versioning and safe reconciliation remain unfinished.
5. **Offline media:** attaching new media requires internet. Server-side upload validation, resumability, privacy and permissions remain unverified.
6. **Uncertain post save:** show status and ask before reposting; no automatic duplicate.
7. **Conflicting edits:** preserve both versions and ask, rather than silently discarding either. Conflict UI and safe storage are unfinished.
8. **Deleted remotely:** hide the old local copy while deletion is reconciled; do not silently republish. Exact synchronization and local-data recovery/erasure must be reviewed before deleting anything.
9. **Drafts on shared devices:** account-scoped and hidden on sign-out; secure account switching and storage isolation remain unfinished. This is not a guarantee of encryption against a device administrator.
10. **Sync problems:** notification only. Existing status notice is informational and does not constitute a complete recovery flow; any recovery action must be explicitly confirmed and account-scoped.
11. **Initial signup:** controlled first release with public signup considered later, not an immediate public rollout. New-account trusted provisioning and identity ownership remain unimplemented; old experimental accounts stay unlinked until separately approved recovery.
12. **Account recovery:** verified human review; no linking by email or browser-supplied ID.
13. **Sensitive account changes:** require recent sign-in. Exact actions, freshness period, revocation and enforcement need implementation and review.
14. **Account deletion:** let the owner choose between clearly described deletion and preservation options before final confirmation. Do not assume attribution removal makes retained content anonymous. Owner's separate earlier choice to delete identifiable points history still applies. Actual deletion is not authorized by this product choice.
15. **Reports:** hide reported content for the reporter and send it for human review. Reports are not proof. Authorization, abuse prevention, reviewer tools and appeals remain unfinished.
16. **Interest controls:** follow, mute and “show less”; downvotes are not automatically disinterest. These are interest signals, not expertise or truth.
17. **Missing trusted feed signals:** safe chronological fallback, not invented neutral scores or false quality claims. Visibility checks and correct pagination still apply.
18. **Expertise:** defer public expertise labels until an evidence-based human review process is ready; self-declared tags alone do not prove expertise.
19. **Staged rollout:** stop for privacy issues, lost work or excessive errors; review quality and fairness before expansion. Thresholds, monitoring, incident handling and separate deployment approval remain necessary.
20. **Unvalidated features at launch:** keep them disabled; launch only independently verified features with clear limitations, subject to security and rollout review.
21. **Backup:** owner chose no live migrations if a verified backup/safe restore drill is unavailable. Prepare only; even with recovery verified, show exact live SQL and obtain separate approval.

Previously chosen: 6/2/1/1 allocation for 10 eligible feed slots; brain-branch influence evaluated in shadow first; time-limited 30-day retry policy; no automatic point losses; Firebase retained, no email-based identity inference; staged rollout; live project is the current connected Supabase project with experimental accounts. No test project has been created and no cloud data changes are authorized here.
