/**
 * Offline-only stake aggregation. No I/O, persistence, flags or live callers.
 * Every input MUST already have been authenticated, eligibility-checked and
 * resolved using trusted authority for this post's exact tag by the caller.
 * Matching tag strings here cannot establish provenance or expertise. This
 * prototype does not choose the disputed 0.10/0.15 eligibility threshold,
 * reserve points, detect abuse or infer which tier a legacy vote selected.
 * Brigade/ring booleans are synthetic inputs, not automatic penalties.
 * Weighted Wilson scores are heuristics, not proof or probability of truth.
 * The existing Wilson helper can increase when down-mass is added at small
 * totals; this known behavior blocks using this aggregation for live ranking.
 */
import { effectiveMass, SENTINEL_INVALID, wilsonLowerBound, type StakeTier } from "./index";

export type VerifiedStakeV3 = Readonly<{
  voterId: string;
  tag: string;
  direction: "up" | "down";
  tier: StakeTier;
  authority: number;
  ageDays: number;
  brigade: boolean;
  ring: boolean;
}>;
export type StakeMassAggregateV3 = Readonly<{ upMass: bigint; downMass: bigint; wilson: number }>;

export function aggregateStakeMassV3(tag: string, stakes: readonly VerifiedStakeV3[]): StakeMassAggregateV3 {
  if (typeof tag !== "string" || !tag.trim() || !Array.isArray(stakes)) throw new RangeError("Invalid tag or stakes");
  const voters = new Set<string>();
  let upMass = 0n, downMass = 0n;
  for (const stake of stakes) {
    if (!stake || typeof stake.voterId !== "string" || !stake.voterId.trim() || stake.tag !== tag ||
        voters.has(stake.voterId) || (stake.direction !== "up" && stake.direction !== "down") ||
        typeof stake.brigade !== "boolean" || typeof stake.ring !== "boolean") throw new RangeError("Invalid stake");
    voters.add(stake.voterId);
    // The strict helper validates tier, authority and age; it never saturates.
    const mass = effectiveMass(stake.tier, stake.authority, stake.ageDays, stake.brigade, stake.ring);
    if (stake.direction === "up") upMass += mass; else downMass += mass;
  }
  // Wilson's floating-point conversion is deliberately limited to exact integers.
  if (upMass + downMass > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Stake mass exceeds exact conversion range");
  const wilson = wilsonLowerBound(upMass, downMass);
  if (wilson === SENTINEL_INVALID || !Number.isFinite(wilson)) throw new RangeError("Invalid Wilson score");
  return { upMass, downMass, wilson };
}
