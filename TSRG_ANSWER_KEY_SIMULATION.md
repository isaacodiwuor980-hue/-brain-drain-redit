# Synthetic answer-key comparison — not production validation

**VERIFIED:** Run `npx tsx scripts/test/tsrg-answer-key-simulation.ts`. This run uses a fixed seed and 20,000 fabricated binary questions, split into four scenarios of 5,000. All labels, voter reliability and reactions are invented. It uses no real user, database, post content or network. The answer key is used only to generate and evaluate votes; the scoring functions do not see it.

Each question has one predesignated synthetic "expert" casting a Life reaction with supplied authority 0.8, and either 99 or three other synthetic voters casting Mouth reactions with supplied authority 0.2. Account age is 30 days. The model **assumes** the identity, authority, topic eligibility, confidence and behavior rather than establishing any of them. Vote correctness is sampled independently using fixed per-scenario rates; systematic error is represented by a low rate, not a model of correlated behavior. These assumptions are not evidence about real people.

For evaluation only, a binary baseline chooses the majority; the other columns compare each score for the up orientation against the same formula with the inputs reversed. That comparison is a synthetic classification rule, **not** the current feed ranking algorithm and not an approved voting policy. A tie is counted separately, not as correct.

| Scenario | Votes/question | Binary: correct / incorrect / ties | Existing Wilson comparison | Alternative prior comparison |
| --- | ---: | ---: | ---: | ---: |
| Other voters 60% right; expert 99% right | 100 | 4,884 / 76 / 40 | 4,979 / 21 / 0 | 4,979 / 21 / 0 |
| Other voters 10% right; expert 99% right | 100 | 0 / 5,000 / 0 | 0 / 5,000 / 0 | 0 / 5,000 / 0 |
| Other voters 90% right; expert 1% right | 100 | 5,000 / 0 / 0 | 5,000 / 0 / 0 | 5,000 / 0 / 0 |
| Four voters; other voters 60% right; expert 80% right | 4 | 2,821 / 616 / 1,563 | 3,999 / 1,001 / 0 | 3,999 / 1,001 / 0 |

All methods reported zero invalid results in this run. The alternative and existing score produce the same orientation decisions for these scenarios, despite producing different numerical scores and having different low-mass behavior. In the four-voter fixture the expert's fixed mass is greater than the combined mass of the other three, so the weighted decision is effectively the expert's answer. The simulation does not establish which score orders actual posts better, measure calibration, or show that either score estimates factual accuracy.

## Findings and limitations

- The 1%-expert case shows the current finite mass weights **do not protect a correct minority** against the specified strongly incorrect majority. Simply increasing one person's influence creates the converse risk: an incorrectly identified or compromised expert can dominate. Neither case resolves how to verify expertise.
- This is a deliberately simple model with known synthetic labels, fixed confidence tiers and supplied authority; it is not a real 20,000-user test or a real-world accuracy estimate. It does not model eligibility, incentives, bots, correlated networks, independent evidence, missing data, label mistakes, harmful content, abuse, user welfare, truth for subjective posts, UI or live latency.
- The experimental alternative has a documented zero-vote discontinuity. Both functions are heuristic calculations; neither establishes truth or is a calibrated probability. Tests are evidence for these selected cases only.
- Compare on independently reviewed outcomes and wider held-out scenarios. Add explicit uncertainty and evidence review rather than silently turning a controversial score into a factual label or changing authority weights. The previously agreed 0.10 Mouth policy conflicts with the recent reference; do not change it silently. Keep point losses and the experimental feed disabled until separate approval and safety work.
