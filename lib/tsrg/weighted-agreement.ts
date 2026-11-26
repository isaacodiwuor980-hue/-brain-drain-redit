/**
 * Isolated arithmetic prototype, not connected to voting or feed ranking.
 * Weighted Wilson-style scores are heuristic: weighted points are not
 * independent observations and this is not a factual accuracy probability
 * or a calibrated 95% confidence interval.
 */
export type AgreementTier = "mouth" | "lunch" | "house" | "life";
export type AgreementVote = {
  direction: "agree" | "disagree";
  tier: AgreementTier;
  trust: number;
};

const WEIGHTS: Record<AgreementTier, number> = { mouth: 1, lunch: 2, house: 3, life: 4 };
const Z = 1.96;

export interface AgreementEstimate {
  positiveWeight: number;
  negativeWeight: number;
  /** Share of weighted points in agreement, in the range 0 to 1. */
  weightedShare: number;
  /** Wilson-style lower bound using weighted points as a heuristic sample size. */
  lowerBound: number;
  voteCount: number;
  effectiveWeightedVolume: number;
}

/**
 * Inputs must be supplied from a trusted and deduplicated source. The caller
 * provides a reviewed dampening factor; no brigade detection is performed.
 * An empty set has no estimate, not zero percent agreement. Throws for invalid
 * inputs instead of silently fabricating a result.
 */
export function estimateWeightedAgreement(votes: readonly AgreementVote[], dampening = 1): AgreementEstimate | null {
  if (!Number.isFinite(dampening) || dampening <= 0 || dampening > 1) {
    throw new RangeError("Dampening must be greater than zero and at most one");
  }
  let positiveWeight = 0;
  let negativeWeight = 0;
  for (const vote of votes) {
    if (!Object.prototype.hasOwnProperty.call(WEIGHTS, vote.tier) ||
        (vote.direction !== "agree" && vote.direction !== "disagree") ||
        !Number.isFinite(vote.trust) || vote.trust < 0.1 || vote.trust > 1) {
      throw new RangeError("Invalid vote");
    }
    const weight = WEIGHTS[vote.tier] * vote.trust;
    if (vote.direction === "agree") positiveWeight += weight;
    else negativeWeight += weight;
  }
  if (votes.length === 0) return null;
  const total = positiveWeight + negativeWeight;
  const effectiveWeightedVolume = total * dampening;
  if (!Number.isFinite(total) || !Number.isFinite(effectiveWeightedVolume) || effectiveWeightedVolume <= 0) {
    throw new RangeError("Weighted volume out of range");
  }
  // Dampening shrinks volume, not the proportion: P/(n*B) can exceed one.
  const weightedShare = positiveWeight / total;
  const z2 = Z * Z;
  const lowerBound = (weightedShare + z2 / (2 * effectiveWeightedVolume) -
    Z * Math.sqrt((weightedShare * (1 - weightedShare) + z2 / (4 * effectiveWeightedVolume)) / effectiveWeightedVolume)) /
    (1 + z2 / effectiveWeightedVolume);
  if (!Number.isFinite(lowerBound)) throw new RangeError("Score out of range");
  return { positiveWeight, negativeWeight, weightedShare, lowerBound: Math.max(0, Math.min(1, lowerBound)), voteCount: votes.length, effectiveWeightedVolume };
}
