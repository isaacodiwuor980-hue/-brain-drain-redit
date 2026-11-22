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
  // Do not hand plugins references to the caller's objects. Freeze a minimal
  // snapshot so a failed scorer cannot corrupt inputs or a later fallback.
  const inputs: FeedCandidate[] = canonical.map(candidate => Object.freeze({
    id: candidate.id, topic: candidate.topic, author: candidate.author, source: candidate.source,
    signals: Object.freeze({ quality: candidate.signals.quality, relevance: candidate.signals.relevance }),
  }));
  const ruleScores = inputs.map(candidate => normalized(rules(candidate)));
  let modelScores: number[] | undefined;
  if (model && modelWeight > 0) {
    try { modelScores = inputs.map(candidate => normalized(model(candidate))); }
    catch { modelScores = undefined; }
  }
  return canonical.map((candidate, i) => ({
    candidate,
    score: modelScores ? (1 - modelWeight) * ruleScores[i] + modelWeight * modelScores[i] : ruleScores[i],
    tie: tieKey(candidate.id, seed),
  })).sort((a, b) => b.score - a.score || a.tie - b.tie || (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0)).map(row => row.candidate);
}

export type DiversityCaps = Readonly<{ windowSize: number; author: number; topic: number; source: number }>;

/**
 * Optional offline reordering of an already ranked list using soft rolling
 * window caps. The highest-ranked eligible item is selected first. If no item
 * fits all caps, the highest-ranked remaining item is kept rather than lost;
 * caps are therefore best effort, not guaranteed. No exploration quota,
 * eligibility enforcement, pagination or live integration is provided.
 * Complexity is quadratic in candidates and proportional to window size.
 */
export function diversifyOffline(ranked: readonly FeedCandidate[], caps: DiversityCaps): FeedCandidate[] {
  if (!Number.isSafeInteger(caps.windowSize) || caps.windowSize < 1 || [caps.author, caps.topic, caps.source].some(n => !Number.isSafeInteger(n) || n < 1 || n > caps.windowSize)) throw new RangeError("Invalid diversity caps");
  const ids = new Set<string>();
  for (const candidate of ranked) {
    if (!candidate || typeof candidate.id !== "string" || !candidate.id || ids.has(candidate.id) || typeof candidate.author !== "string" || !candidate.author || typeof candidate.topic !== "string" || !candidate.topic || typeof candidate.source !== "string" || !candidate.source) throw new RangeError("Invalid feed candidate");
    ids.add(candidate.id);
  }
  const remaining = [...ranked];
  const result: FeedCandidate[] = [];
  while (remaining.length) {
    const recent = result.slice(-Math.min(result.length, caps.windowSize - 1));
    // slice(-0) returns the entire list, so explicitly handle a one-item window.
    if (caps.windowSize === 1) recent.length = 0;
    const eligible = remaining.findIndex(candidate =>
      recent.filter(c => c.author === candidate.author).length < caps.author &&
      recent.filter(c => c.topic === candidate.topic).length < caps.topic &&
      recent.filter(c => c.source === candidate.source).length < caps.source,
    );
    result.push(remaining.splice(eligible < 0 ? 0 : eligible, 1)[0]);
  }
  return result;
}
