/** Experimental TSRG primitives. These signals are NOT evidence of truth.
 * Fixed-point accumulation is exact; final Wilson/decay calculations use JS
 * floating point and are not guaranteed bit-identical across runtimes. */
export const FIXED_SCALE = 1n << 32n;
const MAX_SAFE_FIXED = BigInt(Number.MAX_SAFE_INTEGER);
export const WILSON_Z = 1.281551565545;
export const WILSON_PRIOR = 1.86;
export const SENTINEL_INVALID = -1e9;
export type StakeTier = "mouth" | "lunch" | "house" | "life";
export type AuthorityTier = 0 | 1 | 2 | 3 | 4;
const tiers: StakeTier[] = ["mouth", "lunch", "house", "life"];
const mass: Record<StakeTier, number> = { mouth: 0.25, lunch: 0.5, house: 0.75, life: 1 };

export function toFixed(value: number): bigint {
  if (!Number.isFinite(value) || Math.abs(value) > 256) throw new RangeError("Invalid fixed-point input");
  return BigInt(Math.round(value * Number(FIXED_SCALE)));
}
export function fromFixed(value: bigint): number {
  if (value > MAX_SAFE_FIXED || value < -MAX_SAFE_FIXED) throw new RangeError("Fixed-point total exceeds safe conversion range");
  return Number(value) / Number(FIXED_SCALE);
}
export function sanitize(value: number): number {
  if (value === SENTINEL_INVALID || !Number.isFinite(value)) return SENTINEL_INVALID;
  return Math.min(1e9, Math.max(0, value));
}
export function authorityTier(value: number): AuthorityTier {
  if (!Number.isFinite(value) || value < 0.15) return 0;
  if (value < 0.35) return 1;
  if (value < 0.55) return 2;
  if (value < 0.75) return 3;
  return 4;
}
/** Gate on authority for the specific tag; callers must supply trusted server data. */
export function canStake(authorityByTag: ReadonlyMap<string, number>, tag: string, stake: StakeTier, ageDays: number): boolean {
  const authority = authorityByTag.get(tag);
  const index = tiers.indexOf(stake);
  return typeof authority === "number" && Number.isFinite(authority) && authority >= 0 && authority <= 1 &&
    Number.isFinite(ageDays) && ageDays >= 1 && index >= 0 && authorityTier(authority) > index;
}
export function effectiveMass(stake: StakeTier, authority: number, ageDays: number, brigade: boolean, ring: boolean): bigint {
  if (!Object.prototype.hasOwnProperty.call(mass, stake) || !Number.isFinite(authority) || authority < 0 || authority > 1 || !Number.isFinite(ageDays) || ageDays < 1) {
    throw new RangeError("Invalid stake inputs");
  }
  let value = Math.max(0.01, mass[stake] * (ageDays < 7 ? 0.2 : 1));
  value = Math.max(0.01, value * (brigade ? 0.5 : 1));
  value = Math.max(0.01, value * (ring ? 0.25 : 1));
  return toFixed(value * (1 + 2 * authority));
}
export function wilsonLowerBound(up: bigint, down: bigint): number {
  if (up < 0n || down < 0n) return SENTINEL_INVALID;
  if (up + down === 0n) return 0;
  try {
    const u = fromFixed(up), d = fromFixed(down), n = fromFixed(up + down);
    const p = (u + WILSON_PRIOR) / (u + d + 2 * WILSON_PRIOR);
    const z2 = WILSON_Z * WILSON_Z;
    const score = (p + z2 / (2 * n) - WILSON_Z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / (1 + z2 / n);
    return Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : SENTINEL_INVALID;
  } catch { return SENTINEL_INVALID; }
}
export function bridgingBonus(forClusters: ReadonlySet<string>, againstClusters: ReadonlySet<string>): number {
  let unique = 0;
  for (const cluster of forClusters) if (cluster && !againstClusters.has(cluster)) unique++;
  return unique >= 2 ? 1.35 : 1;
}
/** A heuristic alert, not a determination of coordinated manipulation. */
export function cusumBrigade(velocities: number[], mean: number, stdev: number): boolean {
  if (!Number.isFinite(mean) || !Number.isFinite(stdev) || stdev <= 0 || velocities.some(v => !Number.isFinite(v) || v < 0)) return false;
  let sum = 0;
  for (const velocity of velocities) {
    sum = Math.max(0, sum + velocity - mean - 0.5 * stdev);
    if (sum > 5 * stdev) return true;
  }
  return false;
}

/** TSRG v2 fixed-point conversion with saturation; legacy toFixed remains strict. */
export function toFixedV2(value: number): bigint {
  if (!Number.isFinite(value)) return 0n;
  return BigInt(Math.round(Math.max(-256, Math.min(256, value)) * Number(FIXED_SCALE)));
}

/** TSRG v2 saturating fixed-point conversion; legacy fromFixed remains strict. */
export function fromFixedV2(value: bigint): number {
  const cap = 1n << 53n;
  return Number(value > cap ? cap : value < -cap ? -cap : value) / Number(FIXED_SCALE);
}

/** TSRG v2 normalized input helper, returning zero for non-finite values. */
export function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** TSRG v2 stake eligibility with a reason; caller must obtain trusted authority. */
export function canStakeDetailed(authority: number, stake: StakeTier, ageDays: number): { allowed: boolean; reason?: string } {
  if (!Number.isFinite(authority) || authority < 0.15 || authority > 1) return { allowed: false, reason: "AUTHORITY_TOO_LOW" };
  if (!Number.isFinite(ageDays) || ageDays < 1) return { allowed: false, reason: "ACCOUNT_TOO_NEW" };
  const index = tiers.indexOf(stake);
  if (index < 0) return { allowed: false, reason: "INVALID_TIER" };
  const maxIndex = authorityTier(authority) - 1;
  if (index > maxIndex) return { allowed: false, reason: `TIER_CAP_EXCEEDED (max: ${tiers[maxIndex]})` };
  return { allowed: true };
}

/** TSRG v2 sequential-floor fixed-point mass, separate from strict legacy mass. */
export function effectiveMassV2(stake: StakeTier, authority: number, ageDays: number, brigade: boolean, ring: boolean): bigint {
  if (!Object.prototype.hasOwnProperty.call(mass, stake) || !Number.isFinite(ageDays) || ageDays < 1 || !Number.isFinite(authority) || authority < 0 || authority > 1) return 0n;
  let value = Math.max(0.01, mass[stake] * (ageDays < 7 ? 0.2 : 1));
  value = Math.max(0.01, value * (brigade ? 0.5 : 1));
  value = Math.max(0.01, value * (ring ? 0.25 : 1));
  return toFixedV2(value * (1 + 2 * clamp01(authority)));
}

/** TSRG v2 authority blend from normalized activity, declaration and z-score. */
export function authorityComposite(affinity: number, declared: number, zScore: number): number {
  return clamp01(0.5 * clamp01(affinity) + 0.3 * clamp01(declared) + 0.2 * clamp01(zScore));
}

/** TSRG v2 set of supporting clusters without opposition. */
export function winningClusters(forClusters: ReadonlySet<string>, againstClusters: ReadonlySet<string>): Set<string> {
  return new Set([...forClusters].filter(c => c && !againstClusters.has(c)));
}

/** TSRG v2 bridge factor requires a measured median gap of at least 30 minutes. */
export function bridgingBonusV2(forClusters: ReadonlySet<string>, againstClusters: ReadonlySet<string>, medianGapMinutes: number | null): number {
  return medianGapMinutes !== null && Number.isFinite(medianGapMinutes) && medianGapMinutes >= 30 ? bridgingBonus(forClusters, againstClusters) : 1;
}

/** TSRG v2 discussion-depth factor. */
export function discussionDepth(uniqueCommenters: number, avgReplyDepth: number): number {
  if (!Number.isFinite(uniqueCommenters) || !Number.isFinite(avgReplyDepth)) return SENTINEL_INVALID;
  return Math.log1p(Math.max(0, uniqueCommenters)) * (1 + 0.4 * Math.max(0, avgReplyDepth));
}

/** TSRG v2 token overlap is a lexical heuristic, not evidence validation. */
export function jaccard(a: string, b: string): number {
  const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 3));
  const left = tokens(a), right = tokens(b);
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter(token => right.has(token)).length;
  return shared / (left.size + right.size - shared);
}

/** TSRG v2 capped and deduplicated cross-cluster bad-faith penalty. */
export function badFaithPenalty(flags: ReadonlyArray<{ flaggerId: string; flaggerAuthority: number; flaggerCluster: string }>, authorCluster: string): number {
  const seen = new Set<string>();
  let total = 0;
  for (const flag of flags) {
    if (seen.has(flag.flaggerId)) continue;
    seen.add(flag.flaggerId);
    if (flag.flaggerCluster !== authorCluster) total += Math.min(0.1, 0.1 * clamp01(flag.flaggerAuthority));
  }
  return Math.min(0.4, total);
}

/** TSRG v2 comment score bucket, with invalid scores quarantined. */
export function quantizeCommentScore(score: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (!Number.isFinite(score) || score < 0) return 0;
  if (score < 0.2) return 1;
  if (score < 0.4) return 2;
  if (score < 0.6) return 3;
  if (score < 0.8) return 4;
  return 5;
}

/** TSRG v2 co-vote density heuristic; edges alone do not establish abuse. */
export function detectRings(edges: ReadonlyArray<{ u1: string; u2: string; weight: number }>, minSize = 8): Array<{ members: Set<string>; clusteringCoeff: number }> {
  if (!Number.isInteger(minSize) || minSize < 2) return [];
  const adjacency = new Map<string, Set<string>>();
  for (const { u1, u2, weight } of edges) {
    if (!u1 || !u2 || u1 === u2 || !Number.isFinite(weight) || weight <= 0) continue;
    if (!adjacency.has(u1)) adjacency.set(u1, new Set());
    if (!adjacency.has(u2)) adjacency.set(u2, new Set());
    adjacency.get(u1)!.add(u2);
    adjacency.get(u2)!.add(u1);
  }
  const seen = new Set<string>();
  const result: Array<{ members: Set<string>; clusteringCoeff: number }> = [];
  for (const start of [...adjacency.keys()].sort()) {
    if (seen.has(start)) continue;
    const members = new Set<string>();
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const user = stack.pop()!;
      members.add(user);
      for (const neighbor of adjacency.get(user)!) if (!seen.has(neighbor)) { seen.add(neighbor); stack.push(neighbor); }
    }
    if (members.size < minSize) continue;
    let degree = 0;
    for (const user of members) degree += adjacency.get(user)!.size;
    const coefficient = degree / (members.size * (members.size - 1));
    if (coefficient >= 0.5) result.push({ members, clusteringCoeff: coefficient });
  }
  return result;
}

/** TSRG v2 ring overlap check against unexpired observations, not proof of intent. */
export function ringIdentityOverlap(current: ReadonlySet<string>, known: ReadonlyArray<{ members: ReadonlySet<string>; flaggedAt: Date }>, now: Date): boolean {
  if (!current.size || !Number.isFinite(now.getTime())) return false;
  return known.some(ring => {
    const age = now.getTime() - ring.flaggedAt.getTime();
    if (!Number.isFinite(age) || age < 0 || age > 180 * 86_400_000) return false;
    return [...current].filter(member => ring.members.has(member)).length / current.size >= 0.6;
  });
}

/** V2 honors design refinement R1. Under 0.10 remains read-only; 0.10–0.35 is Mouth. */
export function authorityTierV2(value: number): AuthorityTier {
  if (!Number.isFinite(value) || value < 0.1 || value > 1) return 0;
  if (value < 0.35) return 1;
  if (value < 0.55) return 2;
  if (value < 0.75) return 3;
  return 4;
}

/** V2 honors design refinement R1. Eligibility is not wired to production. */
export function canStakeDetailedV2(authority: number, stake: StakeTier, ageDays: number): { allowed: boolean; reason?: string } {
  const tier = authorityTierV2(authority);
  if (tier === 0) return { allowed: false, reason: "AUTHORITY_TOO_LOW" };
  if (!Number.isFinite(ageDays) || ageDays < 1) return { allowed: false, reason: "ACCOUNT_TOO_NEW" };
  const index = tiers.indexOf(stake);
  if (index < 0) return { allowed: false, reason: "INVALID_TIER" };
  if (index >= tier) return { allowed: false, reason: `TIER_CAP_EXCEEDED (max: ${tiers[tier - 1]})` };
  return { allowed: true };
}

/**
 * V2 honors design refinements R1, R2 and R3. Only server-verified earned
 * behavior and evidence-based z-score are eligible; views and self-declared
 * credentials carry zero weight. Caller MUST verify provenance; arithmetic
 * alone cannot detect misrepresented inputs. Never wired to user input.
 */
export function authorityCompositeV2(earnedBehavior: number, earnedZScore: number): number {
  if (!Number.isFinite(earnedBehavior) || !Number.isFinite(earnedZScore) || earnedBehavior < 0 || earnedBehavior > 1 || earnedZScore < 0 || earnedZScore > 1) throw new RangeError("Invalid earned authority inputs");
  return Math.max(0.1, Math.min(1, 0.5 * earnedBehavior + 0.2 * earnedZScore));
}

/**
 * Offline-only symmetric bridge heuristic. Either side may have two clusters
 * not represented on the other side. This is not evidence of independence,
 * truth or abuse, and does not implement a complete feed ranking pipeline.
 * The existing directional functions remain unchanged.
 */
export function bridgingBonusSymmetricV3(support: ReadonlySet<string>, oppose: ReadonlySet<string>, medianGapMinutes: number | null): number {
  return Math.max(bridgingBonusV2(support, oppose, medianGapMinutes), bridgingBonusV2(oppose, support, medianGapMinutes));
}
