# Offline personalization simulation

**VERIFIED:** `npx tsx scripts/test/personalization-synthetic.ts` ran 20,001 sequential synthetic requests against the unwired personalization experiment. Each request considered the same 40 artificial posts in 10 topics and selected 10. One-third had an invented preferred topic, one-third had an empty interest map (cold), and one-third had personalization switched off. The topic called "preferred" for cold/off users is an evaluation label only and was not supplied to the scorer. Quality scores and the 0.4 blend are fixture inputs, not measured quality or approved production weights. No real user, post, database, network or live flag was involved.

| Synthetic group | Requests | Selected slots matching evaluation topic | Mean distinct topics in 10 slots |
| --- | ---: | ---: | ---: |
| Warm, supplied preferred topic | 6,667 | 26,668 / 66,670 | 4.51 |
| Cold, no interest evidence | 6,667 | 6,616 / 66,670 | 4.93 |
| Personalization switched off | 6,667 | 6,696 / 66,670 | 4.93 |

No invalid outputs were counted. The warm result demonstrates the expected behavior **for this constructed fixture**, not genuine satisfaction: every preferred topic had exactly four candidate posts and all four reached the warm feed. That concentration highlights the absence of a topic cap and exploration slot in this scaffold. The experiment is sequential and does not measure end-to-end latency, live RLS, actual opt-out, deletion, quality, fairness or real preferences. Personalization-off means this pure function does not read a supplied interest map; it does not prove that a backend stops collection or deletes old data.

Before deployment evaluate diverse candidate pools and longer sequences, user-controlled preferences, abstention, cold-start variety, topic and author fairness, privacy, independently assessed satisfaction, failures, resource use, trusted inputs and abuse. The 70/15/10/5 algorithm is not implemented. No live feed or approved ranking weights changed.

## Optional soft diversity comparison

**VERIFIED:** A follow-up run applied the existing offline `diversifyOffline` helper after ranking, using a test-only rolling window of 10 and a best-effort cap of 3 per topic. This is not the 70/15/10/5 system or an approved production quota; caps are relaxed if no remaining candidate fits. Among the same 6,667 synthetic warm requests, preferred-topic slots dropped from 26,668 to 20,001 (four to three per page), and average distinct topics rose from 4.51 to 4.83. Cold and opted-out averages rose from approximately 4.93 to 4.98. No invalid outputs were counted. The test shows a trade-off in this one artificial candidate pool, not better satisfaction, equal creator exposure or a guarantee for sparse pools. The helper is quadratic and these sequential results do not establish service latency.
