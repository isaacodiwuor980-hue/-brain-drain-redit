# Production readiness — prioritized working checklist

Status: **not production-ready**. This is a current-branch checklist, not a deployment or live-security attestation. `FEED_PROGRESS_LOG.md`, `BRAIN_SYNC_EXPERIMENT.md`, `IDENTITY_PROVISIONING_DESIGN.md` and `IDENTITY_VOTE_TSRG_MIGRATION_REQUIREMENTS.md` contain detailed evidence and limitations. Historical documents may describe superseded behavior.

## Baseline and safety
- [x] Inspect tracked branch and instructions: no repository `AGENTS.md` found (dependency/build-cache files are not repository instructions); branch clean at start, HEAD `5c9a979` matched remote, no incoming `origin/main` commits.
- [x] PR #3 open, GitHub reported mergeable/clean and quality CI success; Docker, staging and Supabase Preview checks skipped. No deployment/merge authorized.
- [x] Code inspection confirms mounted post reaction, vote-state adapter, Following v2, brain-save API and live TSRG ranking remain disabled/fail closed. This does not constrain direct database writers or old deployments.
- [ ] Reconcile current branch with live schema, complete effective grants/RLS/function/trigger inventory, and independently test real authorization with isolated identities. Existing metadata is partial; current project is live, not disposable. Do not run live tests or migrations without explicit authorization and safeguards.

## Priority 0 — identity, authorization, data integrity
- [ ] Implement and independently review trusted new-account provisioning: establish a reliable new-account eligibility source, revocation, idempotent cross-provider state machine, recovery and ownership proof; no email/UUID-shape links. Existing map is not provisioned. Existing-account migration requires a separate ownership-proof process.
- [ ] Audit all mounted service-role endpoints for raw Firebase UID versus Supabase UUID, unauthorized projections, hidden direct DB paths and non-atomic ownership checks. Current review identified onboarding, mentors, habits and discover among others; inspect their exact code/schema before changing. Recall identity containment is implemented and locally tested; see the current increment below.
- [ ] Onboarding `PATCH` reads then overwrites scratch without concurrency control; its `supabase.update` call passes an already-prefixed filter even though that helper adds `eq.`. Verify correct conditional write behavior and prevent lost updates before enabling writes.
- [ ] Brain sync: unwired CAS/journal prototypes lack trusted provisioning, full field/attachment validation, durable recovery, session-generation integration, app integration, authorization and real multi-device concurrent tests. Legacy full-snapshot API is paused. Do not enable it or claim phone sync.
- [ ] Voting: all-writer identity/authorization enforcement, two-step transitions, bootstrapping, idempotent receipts, concurrency, own-state privacy, retention and cross-device recovery require independent validation. Experiments do not stop direct/privileged bypasses. Keep mounted voting disabled.
- [ ] TSRG: validated authorized candidate retrieval, moderation/blocks, stake provenance, eligibility, privacy, calibrated independent evaluation and rollback remain missing. Keep ranking and behavioral tracking off; experimental scores are not proof of truth.

## Priority 1 — operations and product
- [ ] Verify privacy boundaries, account switching, retries, safe failure messages, direct grants, observability/redaction, recovery and rollback in isolated environments with synthetic accounts. No isolated Firebase/Supabase project is currently verified available; do not create paid resources or mutate the live project without authorization.
- [ ] Restore safe public profile-specific libraries and private account-scoped workspace; do not expose unverified browser caches. Confirm public skills and brain access without private leakage.
- [ ] Confirm exact deployment model, backup/restore, configuration, monitoring and device/browser behavior before a separate deployment authorization. Passing local tests or a skipped preview is not sufficient.

## Completed increment — recall identity and input containment
- Reproduced four failures in `npx vitest run api-server/src/routes/recall.identity.http.test.ts`: unmapped UUID-shaped subject accepted, missing no-store, mismatched owner returned and invalid limit accepted. After fixes, targeted recall/personality/expert identity tests: 3 files / 13 tests passed.
- Recall routes now require a mapped UUID, verify the owner of each privileged query result, return no-store, reject malformed limits and unrepresentable schedules, and avoid logging upstream error bodies. Existing mapped users can use the endpoint; unmapped users fail closed. This does not establish owner provisioning, protect direct DB access, verify referenced brain visibility, or provide idempotent writes and authoritative server-held scheduling; previous SM-2 state is still client supplied. Live schema compatibility is unverified.
- Full `npm test -- --run`: 203 files / 824 tests passed. `npm run lint` (including typecheck) passed with 3 existing warnings; `npm run build` passed with Vite warnings; `git diff --check` passed. Synthetic mocked tests do not prove live authorization. No live data, migrations, deployment or PR merge.
- Next: address onboarding read/identity and concurrency, then remaining mounted raw-UID paths individually; preserve unsafe data rather than invent account linkage. Run relevant and full validation after each integrated increment.
