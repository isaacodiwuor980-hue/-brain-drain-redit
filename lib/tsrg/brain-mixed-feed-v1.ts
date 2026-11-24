import { rankOfflineBrainBranchesV1, type OfflineBrainV1 } from "./brain-branch-rank-v1";
import { buildOfflineMixedFeedV4, type MixedCandidateV4 } from "./feed-mix-v4";

type Candidate = MixedCandidateV4 & Readonly<{ brainId?: string }>;
type Options = Parameters<typeof buildOfflineMixedFeedV4>[1] & Readonly<{
  graphWeight: number;
  graphQualityWeight: number;
  damping: number;
}>;

/**
 * Offline synthetic composition only. Graph inputs, links, eligibility and
 * signals are assumptions, NOT visibility, moderation, truth or expertise.
 * Never pass private graph data; there is no authorization, opt-out, cursor,
 * production signal provenance, persistence or runtime feature flag here.
 *
 * Experimental quality proxy: total/(1+total) maps nonnegative DAG scores to
 * [0,1), blended by an explicit graphWeight. It changes both quality threshold
 * and top scoring, not rising/fairness/discovery scores. This transformation is
 * not calibrated and is not an approved production policy. V4 quotas/backfill
 * apply; all V4 and branch-ranker limitations still apply. Inputs are untouched.
 */
export function buildOfflineBrainMixedFeedV1(candidates: readonly Candidate[], brains: readonly OfflineBrainV1[], options: Options): {candidate: Candidate; section: "top" | "rising" | "fairness" | "discovery"}[] {
  if (!options || !Number.isFinite(options.graphWeight) || options.graphWeight < 0 || options.graphWeight > 1 || !Array.isArray(candidates)) throw new RangeError("Invalid graph composition");
  const ranked = rankOfflineBrainBranchesV1(brains, {qualityWeight:options.graphQualityWeight,damping:options.damping});
  const scores = new Map(ranked.brains.map(b => [b.brainId, b.totalScore / (1 + b.totalScore)]));
  const originals = new Map<string,Candidate>();
  const adjusted = candidates.map(candidate => {
    if (!candidate || typeof candidate.id !== "string" || originals.has(candidate.id)) throw new RangeError("Invalid candidate");
    originals.set(candidate.id, candidate);
    if (candidate.brainId === undefined) return candidate;
    if (typeof candidate.brainId !== "string" || !scores.has(candidate.brainId) || !candidate.signals || !Number.isFinite(candidate.signals.quality) || candidate.signals.quality < 0 || candidate.signals.quality > 1) throw new RangeError("Invalid brain link or quality");
    const quality = (1-options.graphWeight)*candidate.signals.quality + options.graphWeight*scores.get(candidate.brainId)!;
    return {...candidate, signals:{...candidate.signals,quality}};
  });
  return buildOfflineMixedFeedV4(adjusted, options).map(item => ({candidate:originals.get(item.candidate.id)!,section:item.section}));
}
