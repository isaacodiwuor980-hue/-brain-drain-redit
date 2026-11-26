import type { InterestExposureV3 } from "./index";

/**
 * Offline-only alternative to V3; not wired to the app. Uses identical input
 * semantics and decay but divides before halving to avoid subnormal underflow.
 * Inputs must already be genuine, deduplicated exposures; downvotes are not
 * disinterest. This is not an expertise measure or production personalization.
 */
export function interestFromExposuresV4(events: readonly InterestExposureV3[], now: number, halfLifeMs: number, prior: number): Map<string, number> {
  if (!Number.isFinite(now) || !Number.isFinite(halfLifeMs) || halfLifeMs <= 0 || !Number.isFinite(prior) || prior <= 0) throw new RangeError("Invalid interest model configuration");
  const seen = new Set<string>();
  const ordered = [...events];
  for (const event of ordered) {
    if (!event || typeof event.id !== "string" || !event.id || typeof event.topic !== "string" || !event.topic || !Number.isFinite(event.at) || event.at > now || typeof event.engaged !== "boolean" || seen.has(event.id)) throw new RangeError("Invalid or duplicate exposure");
    seen.add(event.id);
  }
  ordered.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const sums = new Map<string, { total: number; positive: number }>();
  for (const event of ordered) {
    const weight = Math.pow(0.5, (now - event.at) / halfLifeMs);
    const row = sums.get(event.topic) ?? { total: 0, positive: 0 };
    row.total += weight;
    if (event.engaged) row.positive += weight;
    sums.set(event.topic, row);
  }
  const result = new Map<string, number>();
  for (const [topic, row] of sums) {
    const denominator = prior + row.total;
    const score = 0.5 + row.positive / denominator - 0.5 * (row.total / denominator);
    result.set(topic, score);
  }
  return result;
}
