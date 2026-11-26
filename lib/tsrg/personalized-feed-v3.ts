import { buildOfflineFeed, type FeedCandidate } from "./feed-pipeline";

/** Offline inputs only. No account, database, event collection or tracking. */
export type OfflinePersonalizedOptionsV3 = Readonly<{
  seed: number;
  personalized: boolean;
  interests?: ReadonlyMap<string, number>;
  /** Explicit experiment setting; no production default or approved policy. */
  qualityWeight: number;
}>;

/**
 * Local comparison scaffold, NOT a production feed. Quality and interest are
 * caller-supplied proxies, not truth, factual quality or user expertise. The
 * caller must enforce permissions, privacy preferences and eligibility before
 * providing any candidate. There is no exploration quota, safety/moderation,
 * deletion, pagination, persistence, feature flag, or live integration.
 *
 * When personalization is off, interests are never accessed; a neutral 0.5 is
 * used for every topic. This local property does not implement backend opt-out
 * or clear stored data. Downvotes are never inferred as lack of interest here.
 */
export function rankOfflinePersonalizedV3(candidates: readonly FeedCandidate[], options: OfflinePersonalizedOptionsV3): FeedCandidate[] {
  if (typeof options.personalized !== "boolean" || !Number.isFinite(options.qualityWeight) || options.qualityWeight < 0 || options.qualityWeight > 1) throw new RangeError("Invalid ranking configuration");
  let interests: Map<string, number> | undefined;
  if (options.personalized) {
    if (!(options.interests instanceof Map)) throw new RangeError("Interest snapshot required");
    interests = new Map();
    for (const [topic, score] of options.interests) {
      if (typeof topic !== "string" || !topic.trim() || !Number.isFinite(score) || score < 0 || score > 1) throw new RangeError("Invalid interest snapshot");
      interests.set(topic, score);
    }
  }
  const weight = options.qualityWeight;
  return buildOfflineFeed(candidates, {
    seed: options.seed,
    rules: candidate => weight * candidate.signals.quality + (1 - weight) * (interests?.get(candidate.topic) ?? 0.5),
  });
}
