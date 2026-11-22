/**
 * Local-only ordering scaffold. Not connected to the app, any flag or data store.
 * A score is not a truth, expertise or safety guarantee. Caller-supplied scorers
 * must be pure and use trusted, privacy-approved inputs. No networking or logging.
 */
export type FeedCandidate = Readonly<{
  id: string;
  topic: string;
  author: string;
  source: string;
  signals: Readonly<{ quality: number; relevance: number }>;
}>;
export type FeedScorer = (candidate: FeedCandidate) => number;
export type OfflineFeedOptions = Readonly<{
  seed: number;
  rules: FeedScorer;
  model?: FeedScorer;
  modelWeight?: number;
}>;

function normalized(score: number): number {
  if (!Number.isFinite(score) || score < 0 || score > 1) throw new RangeError("Invalid feed score");
  return score;
}

// A deterministic tie-breaker, not a security primitive or source of entropy.
function tieKey(id: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  return hash;
}

/**
 * Ranks supplied candidates; data collection, eligibility, diversification,
 * pagination, safety checks, exposure tracking and kill switches are absent.
 * A bad/throwing model is discarded for the entire result; bad rules fail closed.
 */
export function buildOfflineFeed(candidates: readonly FeedCandidate[], options: OfflineFeedOptions): FeedCandidate[] {
  const { seed, rules, model } = options;
  const modelWeight = options.modelWeight ?? 0;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isFinite(modelWeight) || modelWeight < 0 || modelWeight > 1 || typeof rules !== "function") throw new RangeError("Invalid feed configuration");
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.id !== "string" || !candidate.id || ids.has(candidate.id) || typeof candidate.topic !== "string" || !candidate.topic || typeof candidate.author !== "string" || !candidate.author || typeof candidate.source !== "string" || !candidate.source || !candidate.signals) throw new RangeError("Invalid feed candidate");
    normalized(candidate.signals.quality); normalized(candidate.signals.relevance);
    ids.add(candidate.id);
  }
  // Canonicalize evaluation order to avoid input-order-dependent accumulation.
  const canonical = [...candidates].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const ruleScores = canonical.map(candidate => normalized(rules(candidate)));
  let modelScores: number[] | undefined;
  if (model && modelWeight > 0) {
    try { modelScores = canonical.map(candidate => normalized(model(candidate))); }
    catch { modelScores = undefined; }
  }
  return canonical.map((candidate, i) => ({
    candidate,
    score: modelScores ? (1 - modelWeight) * ruleScores[i] + modelWeight * modelScores[i] : ruleScores[i],
    tie: tieKey(candidate.id, seed),
  })).sort((a, b) => b.score - a.score || a.tie - b.tie || (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0)).map(row => row.candidate);
}
