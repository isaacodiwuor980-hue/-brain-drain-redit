# Pre-production checklist — NOT ready for release

This is a review checklist, not authorization to deploy or alter a live project.

## Verified in this session
- Local baseline: 420 tests passed in 80 files; typecheck and build passed; lint had two warnings and no errors.
- After the follow failure fix: 422 tests passed in 81 files; typecheck and build passed; lint had two warnings and no errors. Coverage run reported 62.20% statements, 54.94% branches, 59.46% functions and 63.02% lines for its configured scope; this is not database or complete-repository coverage.
- Read-only live metadata inspection: `follows` and `reactions` exist with RLS enabled; several proposed identity, feature flag and TSRG tables are absent. Local migration numbering does not match the observed live history. See `LIVE_SCHEMA_SNAPSHOT.md`. This is a point-in-time observation, not proof of policy correctness.
- Subsequent local TSRG changes and tests are documented in `FEED_PROGRESS_LOG.md`; some offline prototypes changed after baseline and are not production-wired.

## Release blockers — unresolved
- The owner chose new-account provisioning only initially; existing accounts stay unlinked pending an approved recovery design. Implement and independently review trusted new-account eligibility/provisioning and consistent identity handling, respecting legacy TEXT-keyed data. Never infer links from email. Test with two separate users; see `IDENTITY_PROVISIONING_DESIGN.md`.
- Reconcile the live schema and migration history with reviewed migration and rollback plans. The live `follows` table differs from the application's legacy `user_follows` expectation. Follow writes now fail closed if storage is missing, but following is not repaired.
- Verify actual live RLS policy behavior, grants, functions and triggers using isolated test accounts and an explicitly approved test environment. A service-role test bypasses RLS and cannot establish user isolation.
- The 70/15/10/5 feed is an offline design gap, not live functionality. Ring detection is a connected-component density heuristic, not clique detection; CUSUM does not define time windows. Review the fixed-point and invalid-number behavior before any live activation.
- Keep experimental flags off. The existing client status switch is not a security boundary. Do not enable staking, automatic penalties or experimental ranking.
- The owner reports that the previously exposed GitHub token was revoked and Firebase/Google key restrictions were reviewed. These reports have not been independently verified here; do not record or request credentials.
- Obtain approval for any isolated database/browser tests and later for any production change. Back up and establish rollback and monitoring before any approved mutation.

## Tools still needed
Migration application, RLS verification and identity-map population scripts requested for this session are **not implemented**. Do not use an invented SQL REST endpoint or populate mappings without verified ownership. A genuine database connection or supported management interface, least-privilege credentials and a safe test environment need separate review; never paste secrets into chat. Mock tests cannot establish real database safety.

### Vote containment update (local branch only; not a launch approval)
- **VERIFIED locally with mocked HTTP/storage:** the mounted legacy post reaction route rejects authenticated requests with 503 regardless of flags (this also pauses reposts); the mounted experimental vote-state route requires recent authentication and then returns 503 even if enabled. The old implementations are unmounted test fixtures, not production-ready writers.
- **VERIFIED locally with fixtures:** comment, House and Mouth hook actions reject before storage or analytics; the post hook and shown controls are hard-disabled; topic/search vote totals are removed. Feed responses omit up/down aggregates, and the social feed display redacts cached vote details. Regression tests cover synthetic account separation, stale auth and cached-account redaction; these are not live authorization or real cross-device tests.
- **NOT VERIFIED / BLOCKING:** direct database access, service-role and security-definer functions, other clients/routes/caches, complete vote confidentiality and all-writer coverage. The feed API still includes the requester's reaction types in ordinary feed responses and caches identities internally; comment ordering can still depend on local vote data. Five-minute authentication is not enforced for all sensitive operations. The gated endpoint is not a substitute for database permissions.
- **NOT IMPLEMENTED / BLOCKING:** secure, visibility-authorized own-vote read; server-enforced two-step, versioning, retry and uncertainty handling for every writer; real account-switch and cross-device tests; recovery verification, private offline safety, moderation, and native Android/iOS validation. Keep voting and reposting unavailable and do not deploy or enable flags based on these tests.
