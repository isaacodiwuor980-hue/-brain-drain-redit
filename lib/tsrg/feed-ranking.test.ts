import { describe, expect, it } from "vitest";
import { DEFAULT_FEED_RANKING_WEIGHTS as W, scoreFeedCandidate, type FeedRankingSignals } from "./feed-ranking";
const base: FeedRankingSignals = { consensus: 0.5, confidence: 0.5, topicEngagement: 0.5, viewThroughRatio: 0.5, recency: 0.5, topicInterest: 0.5, authorAuthority: 0.5, impressions: 100, brigadeRisk: 0, lowTrustSpike: 0 };
describe("offline feed ranking arithmetic", () => {
  it("increases score for lower view-through but caps the signal", () => {
    const high = scoreFeedCandidate({ ...base, viewThroughRatio: 1 });
    const low = scoreFeedCandidate({ ...base, viewThroughRatio: 0 });
    expect(low - high).toBeCloseTo(W.lowViewThrough);
    expect(scoreFeedCandidate({ ...base, viewThroughRatio: 0, recency: 0 })).toBeLessThan(scoreFeedCandidate({ ...base, viewThroughRatio: 1, recency: 1 }));
  });
  it("does not reward unknown ratios, and rejects a ratio without impressions", () => {
    expect(scoreFeedCandidate({ ...base, impressions: 0, viewThroughRatio: null })).toBeGreaterThan(scoreFeedCandidate({ ...base, impressions: 100, viewThroughRatio: null }));
    expect(() => scoreFeedCandidate({ ...base, impressions: 0, viewThroughRatio: 0 })).toThrow(RangeError);
    expect(scoreFeedCandidate({ ...base, viewThroughRatio: null })).toBeCloseTo(scoreFeedCandidate({ ...base, viewThroughRatio: 1 }));
  });
  it("decreases exploration with exposure and applies bounded risk penalties", () => {
    expect(scoreFeedCandidate({ ...base, impressions: 1 })).toBeGreaterThan(scoreFeedCandidate({ ...base, impressions: 1000 }));
    expect(scoreFeedCandidate({ ...base, brigadeRisk: 1, lowTrustSpike: 1 })).toBeLessThan(scoreFeedCandidate(base));
  });
  it("weights consensus by confidence, without treating interest as authority", () => {
    expect(scoreFeedCandidate({ ...base, confidence: 0 })).toBeLessThan(scoreFeedCandidate({ ...base, confidence: 1 }));
    expect(scoreFeedCandidate({ ...base, topicInterest: 1, authorAuthority: 0 })).not.toBe(scoreFeedCandidate({ ...base, topicInterest: 0, authorAuthority: 1 }));
  });
  it("rejects malformed metrics, ratios, and weights", () => {
    for (const n of [-1, NaN, Infinity, 1.01]) expect(() => scoreFeedCandidate({ ...base, consensus: n })).toThrow(RangeError);
    for (const n of [-1, 1.1, NaN]) expect(() => scoreFeedCandidate({ ...base, viewThroughRatio: n })).toThrow(RangeError);
    for (const n of [-1, 0.5, Infinity]) expect(() => scoreFeedCandidate({ ...base, impressions: n })).toThrow(RangeError);
    expect(() => scoreFeedCandidate(base, { ...W, explorationHalfLife: 0 })).toThrow(RangeError);
  });
  it("keeps extreme scores in range", () => {
    expect(scoreFeedCandidate({ consensus: 1, confidence: 1, topicEngagement: 1, viewThroughRatio: 0, recency: 1, topicInterest: 1, authorAuthority: 1, impressions: 1, brigadeRisk: 0, lowTrustSpike: 0 })).toBeLessThanOrEqual(1);
    expect(scoreFeedCandidate({ consensus: 0, confidence: 0, topicEngagement: 0, viewThroughRatio: 1, recency: 0, topicInterest: 0, authorAuthority: 0, impressions: 10000, brigadeRisk: 1, lowTrustSpike: 1 })).toBe(0);
  });
});
