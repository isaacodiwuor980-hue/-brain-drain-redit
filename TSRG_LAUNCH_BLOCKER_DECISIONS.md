# Decisions on TSRG launch blockers

Owner responses to 20 risk questions. These are policy decisions, not proof of implementation or permission to change the live project. Read alongside `PILOT_LAUNCH_DECISIONS.md` and `ONLINE_FIRST_PRODUCT_DECISIONS.md`.

## Recovery
1. Owner does not know whether the current connected Supabase project has a usable backup. **UNVERIFIED:** existence, freshness, coverage and restorability. Do not perform live migrations without the earlier selected verified-backup/safe-restore condition and specific approval.
2. Prefer to avoid paid recovery features. Investigate feasible alternatives and explain limitations and costs; do not enable paid services without approval.
3. Do not create another project for a restore drill at present. A genuinely safe alternative must be identified; do not assume an untested export or live-project restore is an adequate substitute.
4. Before an actual restore that could overwrite newer work, present affected systems/data, risks and recovery plan for explicit approval. No automatic restore.
5. Launch is blocked if recovery of Firebase or media used in the pilot cannot be established. Features not safely supported can be excluded subject to the approved launch scope; text-only pilot was selected if media storage is not ready.

## Identity
6. A Firebase account whose database provisioning fails stays blocked from protected actions until verified repair; do not delete it or guess a link. The earlier decision also says pause signup when secure linking fails.
7. Existing experimental accounts are not to be used as linked pilot accounts; use securely provisioned new accounts. Existing accounts stay unlinked until a separately approved ownership-proof process.
8. On a conflicting identity link, block and send for human review; do not overwrite either mapping.
9. Email changes never automatically relink to a different database identity. Recent sign-in and reviewed recovery rules still apply.
10. When recovery evidence is inconclusive, do not link; request stronger proof. No account data or protected access until ownership is established.

## Cross-device voting
11. On a lost/uncertain vote response, do not send another vote until it can be checked; show uncertainty. A network-status hint does not establish whether the server committed the action.
12. When another device has a newer vote, show the latest state and ask again, not silently overwrite it. Requires server-enforced versions and trusted identity.
13. Keep already held, ambiguous offline reactions for individual review. Do not automatically send or delete; no complete recovery interface exists yet.
14. Pause affected voting during upgrades until every writer is safe, including direct database access, privileged functions and older app versions. Do not rely on a browser flag or client upgrade as a security boundary.
15. Hide public vote counts and scores for both posts and comments, and do not disclose other users' identities as voters. Repost totals were not included in this clarification; do not infer that they are vote scores. Audit APIs, database grants, derived values, caches and all clients before claiming protection. Internal scoring requires an independently protected interface, not public counts.

## TSRG and launch
16. Insufficient authority evidence means unknown authority and safe defaults; views or self-declared tags do not establish expertise. Do not equate unknown with zero knowledge or invent an authority score.
17. Where weighted agreement conflicts materially with a credible knowledgeable minority, hide the confidence result rather than present it as a factual verdict. The criteria, trusted evidence, privacy and human review are not yet specified or implemented; keep confidence display disabled until safe criteria are reviewed. Weighted agreement is not proof of truth.
18. Suspected coordinated voting produces an alert for human review, not automatic penalties; suspicion is not proof and automatic losses remain disabled.
19. If identity/basic voting are ready but TSRG ranking is not, use a safe chronological feed. Privacy, blocks and moderation must be enforced before serving even fallback content. TSRG remains off until validated; the earlier shadow-first brain-branch decision remains in force.
20. Present one exact live stage at a time, with its scope, prerequisites, downtime, costs, verification and rollback, for separate approval. The target is the current Supabase project; no live migration, deployment, resource creation, destructive action or paid feature is approved by these answers.

**Status:** the scoring and some prototypes have local synthetic evidence only. Backup recovery, verified identity linking, all-writer vote safety, recovery UI, real authorization, full feed and production deployment remain incomplete or unverified. No launch/readiness guarantee.
