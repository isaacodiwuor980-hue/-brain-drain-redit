/**
 * Offline-only ranking arithmetic. Not wired to any route, logging, flag or UI.
 * The inputs are normalized signals, not proof of truth or user expertise.
 * In particular, a low view-through ratio may mean poor relevance, not quality.
 */
export interface FeedRankingSignals {
  consensus: number;
  confidence: number;
  topicEngagement: number;
  /** Distinct qualifying views divided by impressions; null if no impressions. */
  viewThroughRatio: number | null;
  recency: number;
  topicInterest: number;
  authorAuthority: number;
  impressions: number;
  brigadeRisk: number;
  lowTrustSpike: number;
}

// Experimental placeholders, not calibrated or approved for live ordering.
export const DEFAULT_FEED_RANKING_WEIGHTS = Object.freeze({
  consensus: 0.20, topicEngagement: 0.20, lowViewThrough: 0.05,
  recency: 0.20, topicInterest: 0.15, authorAuthority: 0.05,
  exploration: 0.15, brigadeRisk: 0.15, lowTrustSpike: 0.10,
  explorationHalfLife: 100,
});
export type FeedRankingWeights = { [K in keyof typeof DEFAULT_FEED_RANKING_WEIGHTS]: number };

function unit(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${name} must be between zero and one`);
  return value;
}
/** Returns a bounded [0,1] score. No downstream ordering is changed. */
export function scoreFeedCandidate(signals: FeedRankingSignals, weights: FeedRankingWeights = DEFAULT_FEED_RANKING_WEIGHTS): number {
  for (const name of Object.keys(DEFAULT_FEED_RANKING_WEIGHTS) as (keyof FeedRankingWeights)[]) {
    if (!Object.prototype.hasOwnProperty.call(weights, name)) throw new RangeError(`Missing weight: ${name}`);
  }
  for (const [name, value] of Object.entries(weights)) {
    if (!Number.isFinite(value) || value < 0 || (name === "explorationHalfLife" && value === 0)) throw new RangeError(`Invalid weight: ${name}`);
  }
  const { consensus, confidence, topicEngagement, viewThroughRatio, recency, topicInterest, authorAuthority, impressions, brigadeRisk, lowTrustSpike } = signals;
  if (!Number.isSafeInteger(impressions) || impressions < 0) throw new RangeError("Invalid impressions");
  if (viewThroughRatio !== null && impressions === 0) throw new RangeError("Ratio requires impressions");
  const novelty = weights.explorationHalfLife / (weights.explorationHalfLife + impressions);
  // With no data, do not reward an unknown ratio as if it were zero.
  const ratioSignal = viewThroughRatio === null ? 0 : 1 - unit(viewThroughRatio, "viewThroughRatio");
  const value = weights.consensus * unit(consensus, "consensus") * unit(confidence, "confidence") +
    weights.topicEngagement * unit(topicEngagement, "topicEngagement") + weights.lowViewThrough * ratioSignal +
    weights.recency * unit(recency, "recency") + weights.topicInterest * unit(topicInterest, "topicInterest") +
    weights.authorAuthority * unit(authorAuthority, "authorAuthority") + weights.exploration * novelty -
    weights.brigadeRisk * unit(brigadeRisk, "brigadeRisk") - weights.lowTrustSpike * unit(lowTrustSpike, "lowTrustSpike");
  if (!Number.isFinite(value)) throw new RangeError("Invalid feed score");
  return Math.max(0, Math.min(1, value));
}
