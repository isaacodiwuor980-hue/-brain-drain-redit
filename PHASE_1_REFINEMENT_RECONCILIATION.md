# Refinement reconciliation

- **R1 VERIFIED locally, prototype only:** V2 allows a 0.10 authority account at least one day old to stake Mouth, not higher tiers; values below 0.10 cannot stake. Legacy still rejects 0.10. The requested “read-only below 0.15” conflicts with the explicit 0.10 exception. This implementation takes the latter literally; approve a consistent policy before wiring.
- **R2/R3 VERIFIED arithmetic only:** `authorityCompositeV2` has no views or declared-credential input and applies zero weight to either as separate arguments. It cannot check that its earned inputs are actually earned. 0.5/0.2 weights are prototype assumptions, not calibrated policy; verified data provenance and fairness review are mandatory.
- **R4 VERIFIED by source scope:** added functions are not wired into application routes; no flag was enabled. Existing feed ranking helper is also an isolated prototype, not the requested full feed pipeline.
- **R5 VERIFIED by diff:** legacy exports retained unchanged; new exports are additive. The exploratory failing assertions targeted legacy APIs whereas passing assertions target V2, so no claim of a conventional failing-then-passing production regression is justified.

No factual truth, production readiness, abuse resistance or 100% accuracy is implied by these calculations.
