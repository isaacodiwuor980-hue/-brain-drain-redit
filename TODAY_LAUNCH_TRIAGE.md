# Today's launch triage

**Status: not ready to release. No deployment, migration or live data change has been made.** This is a scope and evidence checklist, not authorization. The owner's earlier choice is to launch the pilot only after web, Android and iOS are validated; initial group up to ten; no automatic production deployment and no spending without separate approval.

## What can be done immediately without live changes

- Continue implementing and testing secure new-account identity, vote recovery and visibility controls locally. Existing local scoring models and their synthetic tests remain intact and default off.
- Plan a Netlify-compatible app/API deployment and controlled preview, with exact routing, server security, secrets handling, logging, spend/usage limits and rollback. Netlify is not connected to this conversation; owner reports their account is Free and GitHub is linked, but this has not been verified. No project or preview is authorized or created.
- Inventory native build and test requirements. The owner reports no separate native repository. Apple and Google developer/test distribution may have fees; `ZERO_BUDGET_DEPLOYMENT_REVIEW.md` cites provider terms. No paid account or purchase is authorized.

## Why the current app is not safe to release today as-is

- **VERIFIED by source inspection, not live traffic:** `api-server/src/routes/posts.ts` uses the verified Firebase subject directly for writes and the existing reaction endpoint is a non-atomic toggle with direct up/down switching and returns aggregate counts. This conflicts with the chosen trusted UUID bridge, two-step vote switching, uncertain-response recovery and vote privacy. `api-server/src/middleware/identity-map.ts` contains a lookup for a trusted mapping but this alone does not provision or prove account ownership and is not applied to every legacy writer. The UI-only count hiding does not protect API or direct database access.
- **UNVERIFIED:** actual backup restoration, full authorization and topic/moderation visibility, private content caches, cross-device recovery, all legacy writers, hosting and real mobile builds. A previously listed backup does not prove restoration works. Current-project changes also require an exact plan and approval.
- The chosen chronological fallback and TSRG scoring are offline models; caller-provided visibility is not real authorization. Existing cached private-content handling and account separation are incomplete.
- Free commercial hosting, native store distribution, outages, support coverage and legal requirements are not guaranteed. No date, cost or security guarantee is possible without verified evidence.

## Gate for a smaller pilot (if the owner later chooses it)

Any alternative scope needs owner approval; do not silently reverse their web-and-native decision. Even read-only public access must independently pass visibility/moderation, cache privacy, hosting, recovery, incident handling and access-control checks. Disable unvalidated writes and TSRG server-side, not only in the UI. Make no public or protected preview with live data until the exact scope, privacy, protection and rollback are reviewed and approved. Do not relink or delete experimental accounts or content.

## Evidence needed for each proposed live stage

Present the exact live project and change, affected systems, recovery evidence, privacy/data-loss risk, maintenance window, monitoring, verification, rollback limitations and costs. Obtain separate explicit approval before execution. Stop on unexpected schema, permissions, ownership, data or behavior. A failed check calls for fixing or disabling the affected feature, not declaring it ready.
