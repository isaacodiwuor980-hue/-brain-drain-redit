import { fromFixed, SENTINEL_INVALID, WILSON_PRIOR, WILSON_Z } from "./index";

/**
 * Offline comparison only; not used by the application or vote aggregation.
 * Applies the existing symmetric pseudocount to BOTH the proportion and the
 * effective sample size. This intentionally changes scores relative to the
 * legacy function. It is an uncalibrated heuristic, not a probability of
 * truth or a validated confidence interval for weighted, correlated votes.
 *
 * No votes retain the legacy cold-start score of zero. This special case means
 * the first downvote can raise the score from zero and introduces a jump; the
 * candidate is not approved for ranking. Invalid or unsafe totals return the
 * existing sentinel. Fixed-point totals are exact; final math is floating point.
 */
export function wilsonPriorCandidateV3(up: bigint, down: bigint): number {
  if (up < 0n || down < 0n) return SENTINEL_INVALID;
  if (up + down === 0n) return 0;
  try {
    const u = fromFixed(up), total = fromFixed(up + down);
    const n = total + 2 * WILSON_PRIOR;
    const p = (u + WILSON_PRIOR) / n;
    const z2 = WILSON_Z * WILSON_Z;
    const score = (p + z2 / (2 * n) - WILSON_Z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / (1 + z2 / n);
    if (!Number.isFinite(score)) return SENTINEL_INVALID;
    return Math.min(1, Math.max(0, score));
  } catch { return SENTINEL_INVALID; }
}
