import { fromFixed, SENTINEL_INVALID, WILSON_Z } from "./index";

/** Offline comparison only: raw Wilson lower-bound arithmetic without a prior.
 * Zero evidence and down-only evidence score zero. This is a policy change,
 * not a claim of truth, expertise, safety, probability or a confidence bound
 * for weighted/correlated votes. A single large stake can behave like many
 * independent votes even though it is not: eligibility and mass scaling must
 * be reviewed before any use. No live caller, storage, logging or flag. */
export function wilsonNoPriorV5(up: bigint, down: bigint): number {
  if (typeof up !== "bigint" || typeof down !== "bigint" || up < 0n || down < 0n) return SENTINEL_INVALID;
  try {
    // Validate the combined conversion even when up is zero.
    const n = fromFixed(up + down);
    const u = fromFixed(up);
    if (n === 0 || u === 0) return 0;
    const p = u / n;
    const z2 = WILSON_Z * WILSON_Z;
    // Rationalized form avoids cancellation of nearly equal terms for small p.
    const denominator = 2 * n * p + z2 + WILSON_Z * Math.sqrt(z2 + 4 * n * p * (1 - p));
    const score = 2 * n * p * p / denominator;
    return Number.isFinite(score) && score >= 0 && score <= 1 ? score : SENTINEL_INVALID;
  } catch {
    return SENTINEL_INVALID;
  }
}
