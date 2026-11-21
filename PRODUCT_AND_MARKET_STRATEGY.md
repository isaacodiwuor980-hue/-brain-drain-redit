# Brain Drain: trusted human knowledge strategy

Research date: 16 November 2026. This is a product hypothesis and implementation roadmap, **not** a valuation, verified market-size estimate, legal opinion, or guarantee of future AI demand. `ENGINEERING_AUDIT.md` documents unresolved technical risks.

## Executive recommendation

Position Brain Drain as **a place to capture the reasoning behind a decision, improve it with other people, and reuse it with clear attribution and permission**. Start with a narrow community and a problem people encounter repeatedly—suggested beachhead: software engineers documenting troubleshooting and technical trade-offs. Validate this choice with users before scaling into every topic.

The moat is not a pile of scraped content or screen time. It is a repeatable loop: **solve a real problem → preserve the decision and evidence → invite corrections → reward contributors → make the improved knowledge easy to find and reuse**. Human usefulness must come before speculative model-training revenue. Evidence, recency, authorship and rights can make data useful, but only if they are actually collected and verified.

## 1. Simulation: what was and was not done

`node scripts/synthetic-product-scenarios.mjs` enumerates 20,000 **hypothetical scenario records**: five author-selected personas × four situations × 1,000 identical repetitions. It also enumerates 1,000 hypothetical engineering/adviser labels across ten disciplines. There are only **20 distinct review scenarios** and **10 distinct engineering categories**. This is a checklist generator, not 20,000 real Play Store users, reviews, predicted ratings, independent agents, app executions, load tests, survey results, or representative opinion. The equal weighting is arbitrary. No reviews were posted and no real user's data was used.

Illustrative scenarios—not actual quotes:
- A new visitor asks whether they can see value before registration.
- A knowledge seeker asks where an answer came from and whether it has been reviewed.
- A contributor asks who can use or license their work and how credit works.
- A mobile user asks whether a failed save loses work.
- A team researcher asks whether retrieval respects permissions and deletion.

These scenarios suggest test questions, not prevalence or user preference. Run real, consent-based interviews and usability studies to validate them; do not publish invented reviews or ratings.

## 2. Competitive landscape

| Competitor | Evidence and established strengths | Opportunity for Brain Drain (hypothesis, not proven market gap) |
|---|---|---|
| Reddit | Reddit reported 121.4 million daily active uniques in Q4 2025 and $2.2 billion in 2025 revenue. It has deep communities and conversation; its OpenAI partnership describes real-time Data API access. [1][2] | Turn a discussion into a reusable, attributed decision record with explicit branches and updates, rather than competing head-on for general social traffic. |
| Stack Overflow | In its 2025 survey, 46% of respondents distrusted AI accuracy versus 33% who trusted it. Stack Overflow offers data licensing and enterprise knowledge products. [3][4] | Start with traceable reasoning and context around trade-offs, rather than promising that a connected tree is correct. |
| Perplexity | Its help center describes search-generated answers with source citations. [5] | Offer inspectable human-created decision paths and revision history, with links to evidence and clear uncertainty; a citation alone is not verification. |
| Discord | Its Discover documentation describes community servers and categories, including mobile discovery limitations in the documented experiment. [6] | Preserve useful conclusions from a discussion in a durable, searchable object, while making the path back to the conversation clear. |

These companies already have distribution, community, and data advantages. A new app cannot assume that its format alone beats them. Test whether a focused workflow produces meaningfully better outcomes than users' current tools. Anecdotal complaints are not representative review analysis; no Play Store review dataset was collected.

## 3. Improvements implemented in this iteration

1. **Honest quality signal:** `lib/reasoning-view.ts` and `ui/confidence-badge.tsx` now label the existing rule-based metric as tree structure instead of “verified reasoning.” Its accessible label and tooltip state that it does not verify accuracy or sources. It is still a structural heuristic—not an audit or expert review.
2. **Trustworthy quick-save feedback:** `pages/HomeFeed.tsx` no longer promises cross-device sync when a save may only be local. `ui/quick-decision.tsx` no longer shows “Saved” after a failed save; it allows a retry. A happy-dom interaction test exercises failure then success.
3. **Reproducible scenario generator:** `scripts/synthetic-product-scenarios.mjs` makes the artificial assumptions and repetition explicit; it makes no requests and does not submit reviews.

No AI data licensing, real consent controls, payments, verified expert review, or human user research was implemented in this iteration. The audit's authorization, offline conflict and cross-device persistence blockers remain open.

## 4. Product priorities

### P0: earn trust before growth or licensing
- Fix the privileged brain-write ownership/concurrency risk, cloud conflict handling, cross-device node hydration and local-first durability gaps in `ENGINEERING_AUDIT.md`.
- Add safe reporting/moderation, spam resistance, clear provenance and a review workflow. Separate **structural completeness**, **source presence**, and **human review status**; never turn unverified claims into a verified badge.
- Provide creator-visible privacy controls, export, deletion and a clear choice about external licensing. Do not assume public posting grants unlimited AI training rights.
- Google Play's policy describes requirements for truthful data disclosures and, for apps enabling account creation, in-app and web account deletion paths; verify actual compliance before release. [7]

### P1: useful first session and return visits
- Let people search or try a useful decision without a compulsory account. Show a real source, the date, author, applicability and uncertainty when available; say “not provided” when absent.
- Improve save/recovery, fast mobile layouts, search filters and contributor feedback. Offer relevant updates on followed knowledge, with user-controlled notification frequency.
- Aim for **useful repeat visits**, not addictive screen time: let users finish and leave, avoid forced autoplay, misleading badges, dark patterns and manufactured urgency.

### P2: improve the knowledge asset
- Versioned records: creator, changes, attribution, references, scope, timestamps, disputes, review status and deletion/tombstone propagation. Protect private content and sensitive personal data. Existing `source_refs` and contributor fields are a starting point, not a rights or provenance system.
- Human review should support independent disagreement and corrections, with reviewer accountability and a review date. A well-connected tree may still be wrong.
- APIs should expose only explicitly eligible records with permissions, rate limits, licensing metadata, citation links and revocation handling; assess rights, privacy and contracts with counsel before commercial release.

## 5. Business model hypotheses

- **Free consumer/community tier:** browse, create, follow and reuse eligible knowledge; build supply and trust first.
- **Team subscription:** private, access-controlled collections, collaborative review, audit trails and integrations. Interview buyers before choosing prices.
- **Enterprise retrieval API:** permission-aware, fresh, attributable knowledge with documented SLAs and usage-based pricing once reliability and rights are proven.
- **Opt-in licensing:** creator-authorized eligible data only, transparent use categories and negotiated contributor compensation. Revocation, deletion propagation, audit trails, legal basis, and third-party handling must be designed before launch; do not promise that trained models can always unlearn a record.
- Avoid treating sensitive information as a commodity or assuming anonymization eliminates privacy risk. Never sell private information or silently change creator terms.

Illustrative unit-economics model—not a forecast: `monthly gross profit = subscription revenue + API revenue + licensing revenue − hosting/inference − moderation − support − contributor payments − payment processing`. Measure retention and contribution margins with real cohorts before setting targets or valuation claims.

## 6. Validation and measurement plan

1. Recruit a small, diverse cohort of actual users with informed consent: engineers seeking answers, contributors and team leads. Observe task completion and ask where they lose trust. Capture consent separately from licensing permission.
2. Compare against each person's existing workflow on the same task. Measure time to useful answer, successful completion, source inspection and ability to recover work. Follow up on whether the answer remained useful—not just time spent in the app.
3. Track cohort retention, returning contributors, useful completed decisions, saved-and-revisited records, search success and source/review coverage. Guardrails: failed saves, unresolved reports, deletion completion, accessibility errors, abuse and privacy incidents. Define events, consent and denominators before collecting data.
4. Interview prospective team/API buyers on current spend and willingness to pilot; use signed pilots and contribution-margin measurements rather than inferred willingness to pay.
5. Run Play Store testing with actual opted-in testers and real devices before publishing. Report sample size, dates, methodology and uncertainty. Never fabricate ratings or reviews.

## References

1. Reddit, Q4 and full-year 2025 results: https://investor.redditinc.com/news-events/news-releases/news-details/2026/Reddit-Reports-Fourth-Quarter-and-Full-Year-2025-Results-Announces-1-Billion-Share-Repurchase-Program/default.aspx
2. Reddit and OpenAI partnership: https://redditinc.com/news/reddit-and-oai-partner
3. Stack Overflow 2025 developer survey, AI section: https://survey.stackoverflow.co/2025/ai
4. Stack Overflow data licensing and enterprise products: https://stackoverflow.co/company/press/archive/stack-overflow-products-api-world-cloudx
5. Perplexity help, cited answers: https://www.perplexity.ai/help-center/en/articles/10352895-how-does-perplexity-work
6. Discord Discover documentation: https://support.discord.com/hc/en-us/articles/25323248535319-Discover-Tab
7. Google Play User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311?hl=en
