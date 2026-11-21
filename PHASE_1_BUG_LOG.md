# Phase 1 local bug and gap log

Status terminology: VERIFIED = observed locally, UNKNOWN = not established. These entries do not establish production behavior.

## R1 legacy baseline eligibility — OPEN in application; additive prototype only
- Reproduce: `npx vitest run lib/tsrg/refinements.test.ts`. Legacy `authorityTier(0.1)` returns 0 and `canStakeDetailed(0.1, 'mouth', 30)` denies; requested baseline Mouth is allowed.
- Root cause: legacy thresholds start at 0.15. The original exploratory assertions expecting legacy compliance failed twice before the additive code was written; final regression explicitly compares both APIs, so this is **not** a same-test red/green fix. Existing behavior is intentionally preserved.
- `authorityTierV2` and `canStakeDetailedV2` provide an unwired alternative; no live fix is claimed. The conflict between “read-only below 0.15” and permitting 0.10 needs a policy decision.

## R2/R3 provenance and declaration — OPEN in application
- Reproduce in the same test: `authorityComposite(0, 1, 0)` returns 0.3; desired declarations alone confer no expertise. Root cause: legacy arithmetic gives declared input weight and cannot ascertain provenance of affinity.
- `authorityCompositeV2` accepts only purported earned signals, with no declaration or view parameter. It trusts the caller; no verification or wiring exists. Its illustrative weights require policy review. Tests demonstrate the alternative, not a before/after fix to production.

## Requested feed pipeline missing — BLOCKED
- Reproduce: `rg '^export' lib/tsrg/index.ts` and inspect `lib/tsrg/feed-ranking.ts`. The handoff names buildFeed, staticTruthScore, personalScore, commentScore and accuracyLabel; these exports are absent. Expected full pipeline cannot be tested or repaired by assuming implementations exist. An independent scoring prototype is not that pipeline.

## Abuse/fairness assertions — OPEN, policy decision needed
- Reproduce: `npx vitest run lib/tsrg/properties.test.ts`. The tests show directional bridging, dense-graph detection without tag data, and damping not guaranteeing less than 1% of nominal mass. They assert observed gaps, not desired defenses. Cohort fingerprints and daily stake budgets are absent from the engine. Root cause: these designs are not present in the available interfaces. Symmetric bridging may contradict support-side intent; do not silently change it.

## Coverage tooling — BLOCKED
- `npx vitest --coverage` fails because `@vitest/coverage-v8` is missing. Two no-save/no-lock local installation attempts failed with npm `Cannot read properties of null (reading 'edgesOut')`. No coverage percentage or complete export coverage is established. Resolve tooling separately without weakening tests.

## Brain-save handoff correction — NOT CONFIRMED AS BUG
- Source `api-server/src/routes/brains.ts` obtains `req.mappedUserId` after mapped identity middleware and passes it as `p_uid`; `api-server/src/routes/brains.identity.http.test.ts` passes with mocked dependencies. This refutes the handoff's direct Firebase UID claim for that path, but is not proof of real database security or every route.
