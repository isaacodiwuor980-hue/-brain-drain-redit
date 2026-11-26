/**
 * Synthetic, unwired ordering model. Caller-provided visibility and topic flags
 * are assumptions, NOT authorization, moderation, block enforcement or trusted
 * topic provenance. Do not connect to a live feed without independently verified
 * server-side eligibility, stable cursor pagination, freshness and privacy.
 */
export type OfflineChronologicalCandidateV1 = Readonly<{
  id: string;
  publishedAt: string;
  visibility: string;
  topicVerified: boolean;
}>;

export function buildOfflineChronologicalFallbackV1<T extends OfflineChronologicalCandidateV1>(
  candidates: readonly T[],
  limit: number,
): T[] {
  if (!Array.isArray(candidates) || !Number.isSafeInteger(limit) || limit < 0 || limit > 100) throw new RangeError("Invalid feed input");
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.id !== "string" || !candidate.id.trim() || candidate.id.length > 120 || ids.has(candidate.id) ||
        typeof candidate.topicVerified !== "boolean" || !["allowed", "denied", "unknown"].includes(candidate.visibility) ||
        typeof candidate.publishedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(candidate.publishedAt)) {
      throw new RangeError("Invalid feed candidate");
    }
    const date = new Date(candidate.publishedAt);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== candidate.publishedAt) throw new RangeError("Invalid publication time");
    ids.add(candidate.id);
  }
  return candidates.filter(candidate => candidate.visibility === "allowed" && candidate.topicVerified)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, limit);
}
