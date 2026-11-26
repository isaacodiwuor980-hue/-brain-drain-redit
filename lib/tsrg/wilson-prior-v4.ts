import { WILSON_PRIOR, WILSON_Z } from "./index";
import { wilsonPriorCandidateV3 } from "./wilson-prior-candidate";

/**
 * Unwired offline comparison only. Unlike V3, the zero-vote value uses the
 * same prior as nonempty inputs rather than a special zero. This changes the
 * cold-start ordering and is NOT an approved ranking policy. The prior gives
 * a positive score without evidence; it does not mean that a post is good,
 * true, or safe. Weighted/correlated votes make this a heuristic, not a
 * validated statistical confidence interval. No production caller uses it.
 */
export function wilsonPriorCandidateV4(up: bigint, down: bigint): number {
  if (up !== 0n || down !== 0n) return wilsonPriorCandidateV3(up, down);
  const n = 2 * WILSON_PRIOR, p = 0.5, z2 = WILSON_Z * WILSON_Z;
  return (p + z2 / (2 * n) - WILSON_Z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}
