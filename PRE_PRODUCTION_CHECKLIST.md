# Pre-production checklist — NOT ready for release

This is a review checklist, not authorization to deploy or alter a live project.

## Verified in this session
- Local baseline: 420 tests passed in 80 files; typecheck and build passed; lint had two warnings and no errors.
- After the follow failure fix: 422 tests passed in 81 files; typecheck and build passed; lint had two warnings and no errors. Coverage run reported 62.20% statements, 54.94% branches, 59.46% functions and 63.02% lines for its configured scope; this is not database or complete-repository coverage.
- Read-only live metadata inspection: `follows` and `reactions` exist with RLS enabled; several proposed identity, feature flag and TSRG tables are absent. Local migration numbering does not match the observed live history. See `LIVE_SCHEMA_SNAPSHOT.md`. This is a point-in-time observation, not proof of policy correctness.
- No code under `lib/tsrg/` changed relative to session baseline `e22fd3c`.

## Release blockers — unresolved
- Establish a trusted ownership proof linking each Firebase subject to its Supabase account; do not infer links from email. Implement and review provisioning and consistent identity handling, respecting legacy TEXT-keyed data. Test with two separate users.
- Reconcile the live schema and migration history with reviewed migration and rollback plans. The live `follows` table differs from the application's legacy `user_follows` expectation. Follow writes now fail closed if storage is missing, but following is not repaired.
- Verify actual live RLS policy behavior, grants, functions and triggers using isolated test accounts and an explicitly approved test environment. A service-role test bypasses RLS and cannot establish user isolation.
- The 70/15/10/5 feed is an offline design gap, not live functionality. Ring detection is a connected-component density heuristic, not clique detection; CUSUM does not define time windows. Review the fixed-point and invalid-number behavior before any live activation.
- Keep experimental flags off. The existing client status switch is not a security boundary. Do not enable staking, automatic penalties or experimental ranking.
- Confirm revocation of the previously exposed GitHub token and review Firebase/Google API key restrictions; neither has been verified here.
- Obtain approval for any isolated database/browser tests and later for any production change. Back up and establish rollback and monitoring before any approved mutation.

## Tools still needed
Migration application, RLS verification and identity-map population scripts requested for this session are **not implemented**. Do not use an invented SQL REST endpoint or populate mappings without verified ownership. A genuine database connection or supported management interface, least-privilege credentials and a safe test environment need separate review; never paste secrets into chat. Mock tests cannot establish real database safety.
