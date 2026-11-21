# Refinement reconciliation

- **R1 VERIFIED locally, prototype only:** V2 allows a 0.10 authority account at least one day old to stake Mouth, not higher tiers; values below 0.10 cannot stake. Legacy still rejects 0.10. The requested “read-only below 0.15” conflicts with the explicit 0.10 exception. This implementation takes the latter literally; approve a consistent policy before wiring.
- **R2/R3 VERIFIED arithmetic only:** `authorityCompositeV2` has no views or declared-credential input and applies zero weight to either as separate arguments. It cannot check that its earned inputs are actually earned. 0.5/0.2 weights are prototype assumptions, not calibrated policy; verified data provenance and fairness review are mandatory.
- **R4 VERIFIED by source scope:** added functions are not wired into application routes; no flag was enabled. Existing feed ranking helper is also an isolated prototype, not the requested full feed pipeline.
- **R5 VERIFIED by diff:** legacy exports retained unchanged; new exports are additive. The exploratory failing assertions targeted legacy APIs whereas passing assertions target V2, so no claim of a conventional failing-then-passing production regression is justified.

No factual truth, production readiness, abuse resistance or 100% accuracy is implied by these calculations.

## Later product decisions
- User approved symmetric support/opposition bridging. `bridgingBonusSymmetricV3` is an isolated, unwired heuristic; the same test failed before the API existed and passes after. Cluster provenance and real-world fairness are unverified.
- Expert-topic tags are public only after supporting evidence is reviewed; a tag is not a badge. No review workflow or public tag is implemented here.
- A downvote is not evidence of topic disinterest. Signed-in users should be able to disable personalization and clear saved interest topics. Neither control is implemented here. Views and interests do not confer expertise.
- Cold starts should be varied; personalize over time and reduce topic exposure with explicit hiding or sustained lack of engagement, while retaining variety. Exact signals, persistence, deletion, safeguards and rollout require design and verification against the actual schema. Do not treat the absence of an interaction as a reliably observed impression.

## Interest prototype

`interestFromExposuresV3` is offline-only and not used by the feed. It learns a bounded per-topic interest estimate from caller-provided qualified exposures, with an explicit prior and half-life, rejecting duplicate identifiers, future timestamps and malformed data. Empty input returns no tags; old evidence fades toward neutral. It does not infer expertise. Downvotes must be excluded by the caller, but this prototype cannot establish event provenance or enforce that rule from raw actions. Treating a non-engagement as meaningful requires reliable exposure measurement; short visibility, accessibility, and uninterested users can confound it. Prior and half-life are experimental inputs, not approved production policy. This is neither tracking, storage, an opt-out/clear control, nor a ranking pipeline.
