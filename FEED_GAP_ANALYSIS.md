# TSRG feed gap analysis

Status: **not implemented end-to-end and not production-ready**. The owner approved an offline-only 70/15/10/5 comparison using both creator and topic exposure; `feed-mix-v4.ts` now provides a preliminary allocator, not a production implementation. This analysis is not authorization to deploy or change the live database. No recommendation policy or score below is a claim that engagement proves factual accuracy or expertise.

## What exists

- The current `GET /api/feed` in `api-server/src/routes/feed.ts` retrieves feed pages; it is not the 70/15/10/5 candidate-generation and ranking engine. The legacy Following path expects `user_follows`, whereas read-only live inspection found `follows`; the separate `following-v2` route is flag-gated and not an approved rollout.
- `lib/tsrg/feed.ts` provides an opt-in client-side Wilson/age reordering of already fetched posts with ordinary reaction counts as proxies. The default is chronological; this is not the full TSRG feed, server pagination or a server-side security boundary.
- `lib/tsrg/feed-pipeline.ts` offers an offline deterministic candidate sorter, scorer fallback and best-effort diversity reorder. `feed-ranking.ts` contains placeholder arithmetic. Neither implements feed slots or applies to the current server feed. Its diversity function is quadratic and does not guarantee exposure equity.
- `interestFromExposuresV3`, the separate V4 numeric experiment, tiered stake aggregation and Wilson-prior candidate are isolated helpers. They do not authenticate inputs, establish expertise, move points or select live feed candidates. Existing Wilson low-mass behavior and V3/V4 numerical differences are documented in `lib/tsrg/README.md`.
- `TSRG_SYNTHETIC_STRESS_REPORT.md` and `TSRG_ANSWER_KEY_SIMULATION.md` document narrowly scoped synthetic testing. Neither proves real-world feed quality, factual correctness, live scalability or fairness.

## Missing for the 70/15/10/5 design

- **70% Top Truth:** trusted eligible candidates, tag-specific inputs and a reviewed score that does not assert truth from votes; real pagination and soft author/community caps.
- **15% Rising:** a reliable, privacy-reviewed velocity window; distinct staker count, cross-cluster independence and impression limits. No live provenance or deployment has been verified.
- **10% Fairness:** a complete, independently reviewed fair exposure design and defined measurement. Deterministic hashing or a single balanced simulation does not establish equal exposure or OPC guarantees.
- **5% Wildcard:** reliable novel-topic discovery, reviewed bridge evidence, quality threshold calibration, safeguards when candidate pools are small and cold-start behavior. Lexical overlap or community agreement does not establish factual truth.
- Explicit slots, rounding for short pages, deduplication across sections, eligibility, safety/moderation, stable cursors and deterministic tie handling, backfill when a section cannot be filled, and explanations have not been integrated end-to-end.

## Work required before rollout

1. Reconcile the Firebase-to-Supabase identity bridge and legacy schemas with verified account ownership. Do not infer mappings from email. Confirm opt-out and deletion on the server and avoid sensitive-trait inference.
2. Establish validated provenance for qualified impressions, interests, topic tags, votes and independently reviewed expertise. Downvotes are not disinterest; views and self-declarations alone do not grant expertise. Calibration outcomes alone do not prove expertise.
3. Resolve documented scoring edge cases through additive, independently tested alternatives; do not replace legacy scoring silently. Stake pricing and outcomes remain undecided and automatic point losses remain disabled.
4. Implement the design only with explicit scope/rollout approval, as a default-off server-side feature with fail-closed fallback to the existing feed. Realistic read-only shadow comparisons require privacy-safe aggregate instrumentation and no second writes.
5. Evaluate synthetic and independently labeled cases, bias and exposure across groups/topics, adversarial attempts, user satisfaction and accessibility, p95/p99 end-to-end latency, concurrency, identity and RLS with approved isolated test users. Establish reviewed targets, monitoring and rollback; do not infer truth from predictions.

## Decision

The **complete 70/15/10/5 feed remains unimplemented**; the newly approved offline scaffold only works with assumed eligibility and supplied synthetic signals. Production should not depend on it until the requirements above are satisfied. Existing feed production readiness is a separate question and is also not certified here. See `FEED_DESIGN.md`, `PRE_PRODUCTION_CHECKLIST.md`, and the progress log for broader blockers.

## Offline brain-branch composition

`brain-mixed-feed-v1.ts` now combines synthetic graph scores and the offline V4 mixed feed. Its explicitly supplied blend and score mapping are experimental, not production policy. It changes no legacy exports and is not a route or integration. It does not establish visibility, trusted quality, identity, moderation, pagination or real-world fairness. The earlier reference to an offline-only approval describes the original scope; the owner subsequently requested live feed integration, which still requires safe prerequisites and deployment approval.
