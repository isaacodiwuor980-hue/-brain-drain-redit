# Phase 1 local test evidence

Baseline on HEAD `5c0944d`: `npm test` 331 tests / 65 files passed; `npm run typecheck` and `npm run build` passed; `npx eslint .` 0 errors / 2 warnings. `npx vitest --coverage` failed: coverage provider missing; installing it twice without a lockfile change failed in npm. Coverage of every export is UNKNOWN.

Independent local subsets (commands run from repository root, all exit 0):

| Layer | Command | Result and limitations |
|---|---|---|
| A unit | `npx vitest run --config vitest.config.ts lib/tsrg/index.test.ts lib/tsrg/v2.test.ts lib/tsrg/refinements.test.ts lib/tsrg/weighted-agreement.test.ts lib/tsrg/feed-ranking.test.ts` | 27 tests, 5 files; not all exports verified. |
| B properties | `npx vitest run --config vitest.config.ts lib/tsrg/properties.test.ts` | 5 deterministic properties of 500 cases each plus 5 adversarial observations. Finite samples, not proof. |
| C determinism | `npx vitest run --config vitest.config.ts lib/tsrg/determinism.test.ts` | 2 tests; isolated prototype, two processes, one runtime/machine, 10 seeds × 1000 synthetic candidates. Observed SHA-256 `a6f4467b0491347ba83768b1a5ecbfd581a9068965b8f4c3f64fe1a4b30a7d70`. Not full pipeline or cross-runtime determinism. |
| D chaos subset | `npx vitest run --config vitest.config.ts lib/sw-cleanup.storage-blocked.test.ts lib/db.brain-transaction.test.ts api-server/src/middleware/p0-gates.test.ts api-server/src/routes/brains.atomic.test.ts` | 23 tests, 4 files; selected simulated failures, not full requested chaos coverage. |
| E adversarial subset | `npx vitest run --config vitest.config.ts lib/tsrg/properties.test.ts` | Observes graph clique, directional bridge and damping gaps; no complete adversarial defense suite. |
| F local schema and mocked HTTP subset | `npx vitest run --config vitest.config.ts lib/migration-chain.integration.test.ts lib/tsrg/schema.integration.test.ts lib/tsrg/p0.integration.test.ts lib/tsrg/reaction-preview.integration.test.ts api-server/src/routes/me.http.test.ts api-server/src/routes/tsrg-status.http.test.ts api-server/src/routes/brains.identity.http.test.ts` | 30 tests, 7 files. PGlite uses auth stubs and lacks vector; HTTP dependencies mocked. Not real Supabase RLS, independent concurrent transactions or real authentication. |

Post-change full `npm test`: 347 tests / 68 files passed; `npm run typecheck` and `npm run build` passed; `git diff --check` passed. `npx eslint .` initially found one new test console warning; removing that log and rerunning yielded 0 errors / 2 pre-existing warnings. After that log-only test edit, the changed determinism file was rerun: 2 passed. Full suite was run immediately before that edit.

**VERIFIED BY TEST:** limited arithmetic, seeded properties, selected local DB and mocked paths above. **MOCKED ONLY:** HTTP identity and storage dependencies. **UNVERIFIED:** real deployed schema/RLS, 70/15/10/5 full pipeline, all exports, cross-runtime determinism, comprehensive chaos and fairness/anti-abuse requirements. Passing tests documenting gaps do not mean those requirements are met.
