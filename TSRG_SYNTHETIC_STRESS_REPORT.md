# TSRG synthetic benchmark: initial result, not a launch approval

## Scope and reproducibility

VERIFIED: `npx tsx scripts/test/tsrg-simulation.ts` ran 20,000 synthetic user feed requests sequentially, each with the same 80 artificial candidates and 10 output slots. It exercises the **offline** `buildOfflineFeed` and `diversifyOffline` helpers, plus one illustrative `estimateWeightedAgreement` calculation. Half the synthetic requests are cold-start and half have a constructed preferred topic. Inputs, preference and quality are invented, not user data or ground truth; the 0.45/0.55 scoring blend is a test fixture, not an approved production setting. No networking or live database was used. Runtime values vary by machine and load.

The comparison is a simple fixed-input-order/recency proxy, **not** Reddit, Quora, X, TikTok, ticktock.ml, or a representation of their algorithms. It gives no evidence of beating another platform. The weighted-agreement example is a mouth/life arithmetic demonstration, not a bet settlement, expertise test, truth test or deployed vote.

## Results from this run

| Metric | Offline experiment | Fixed-order proxy |
| --- | ---: | ---: |
| Synthetic users / output slots | 20,000 / 200,000 | same |
| Ranking errors | 0 | not separately measured |
| Mean fixture quality | 0.8383 | 0.6400 |
| Mean fixture relevance | 0.4700 | 0.3900 |
| Average distinct topics per cold user (10 slots) | 4.0 | not measured |
| Average distinct topics per mature user (10 slots) | 4.0 | not measured |
| Exposure, synthetic groups A / B | 109,936 / 90,064 | 100,000 / 100,000 |
| Local synchronous ranking and diversification latency p50 / p95 / p99 | 0.144 / 0.245 / 0.319 ms | not measured |

Groups are artificial paired candidates: each pair has equal topic, source and constructed quality, but different IDs. Exposure is **54.97% versus 45.03%** despite those matched inputs. This flags a potential tie-breaking/order fairness issue for investigation, not a statistical estimate of real-world fairness or a pass. The particular fixed-order baseline is itself artificial and can be biased in other setups. The mean fixture quality and relevance are outputs of assumptions supplied to the scorer, not independently measured post quality, truth or satisfaction.

## What remains unverified

- No real concurrency, end-to-end HTTP, database access, user-device performance, failures under network faults, availability or long-term reliability was measured. Latencies exclude candidate creation, persistence and network and are not production service latency.
- One synthetic distribution, deterministic IDs and one set of settings cannot establish robustness. Test different seeds, ID assignments, distributions, correlated abuse, sparse topics, new creators, missing signals and exposure over time; investigate the group imbalance before rollout. There is no approved fairness threshold yet.
- No real expert-detection, quiz, verified niche evidence, expert-tag review, personality inference, stake pricing, point loss, outcome verification, or true factual-quality evaluation was performed. Existing expert/identity and database gaps remain.
- No comparable competitor datasets, actual competitor algorithms, approved external data, human evaluations or real user trials were used. Comparative claims need appropriate, comparable evidence and independently defined metrics.
- This does not implement the 70/15/10/5 feed, enable staking, authorize automatic penalties, establish live RLS or certify production readiness. Human evidence review, privacy, opt-out, separate expertise and interest, and no downvote-as-disinterest remain requirements.

## Next engineering work

Investigate and regression-test the exposure imbalance using varied, permuted IDs and user seeds, without assuming a particular demographic attribute or silently forcing a quota. Evaluate objective quality using independently labeled synthetic cases and reviewed datasets. Add isolated concurrency, fault-injection and end-to-end tests only in approved environments; measure full service latency. Reconcile database schema and trusted Firebase/Supabase ownership, design reviewed expert-tag evidence and appeal, and validate server-side privacy and feature switches before any deployment. Do not invent stake prices or burn user points until the deferred policy and reliable outcome process are resolved.
