import { describe, expect, it } from "vitest";
import { DEFAULT_FEED_RANKING_WEIGHTS, scoreFeedCandidate, type FeedRankingWeights } from "./feed-ranking";

const signals = { consensus: 1, confidence: 1, topicEngagement: 1, viewThroughRatio: 1, recency: 1, topicInterest: 1, authorAuthority: 1, impressions: 1, brigadeRisk: 1, lowTrustSpike: 1 };

describe("offline ranking configuration safety", () => {
  it("rejects a missing required weight rather than returning NaN", () => {
    const weights: Partial<FeedRankingWeights> = { ...DEFAULT_FEED_RANKING_WEIGHTS };
    delete weights.recency;
    expect(() => scoreFeedCandidate(signals, weights as FeedRankingWeights)).toThrow(RangeError);
  });
  it("rejects arithmetic overflow rather than returning an invalid score", () => {
    const weights = { ...DEFAULT_FEED_RANKING_WEIGHTS, consensus: Number.MAX_VALUE, topicEngagement: Number.MAX_VALUE, brigadeRisk: Number.MAX_VALUE, lowTrustSpike: Number.MAX_VALUE };
    expect(() => scoreFeedCandidate(signals, weights)).toThrow(RangeError);
  });
});
