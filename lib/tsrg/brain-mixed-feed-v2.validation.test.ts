import { describe, expect, it } from "vitest";
import { buildOfflineBrainMixedFeedV2 } from "./brain-mixed-feed-v2";
import { buildOfflineMixedFeedV5, type MixedCandidateV4 } from "./feed-mix-v4";
import type { OfflineBrainV1 } from "./brain-branch-rank-v1";

const options = { pageSize: 10, seed: 34, qualityWeight: 0.5, minQuality: 0.4, personalized: false, graphWeight: 0, graphQualityWeight: 0.5, damping: 0.5 };
const brains: OfflineBrainV1[] = [{ brainId: "b", rootId: "r", nodes: [{ id: "r", quality: 1, relevance: 1, edges: [] }] }];
const candidates = Array.from({ length: 32 }, (_, i) => ({
  id: `p-${i}`, topic: `t-${i % 5}`, author: `a-${i}`, source: "synthetic",
  eligible: i !== 0, brainId: "b", signals: { quality: i === 1 ? 0.1 : 0.5, relevance: 0.5 },
  rising: 0.5, discovery: 0.5, creatorExposures: i, topicExposures: i,
})) satisfies (MixedCandidateV4 & { brainId: string })[];

describe("offline brain feed V2 additional validation", () => {
  it("matches V5 when graph influence is zero and preserves input", () => {
    const beforeCandidates = structuredClone(candidates), beforeBrains = structuredClone(brains);
    const result = buildOfflineBrainMixedFeedV2(candidates, brains, options);
    expect(result).toEqual(buildOfflineMixedFeedV5(candidates, options));
    expect(candidates).toEqual(beforeCandidates);
    expect(brains).toEqual(beforeBrains);
    expect(result.every(item => candidates.includes(item.candidate as typeof candidates[number]))).toBe(true);
  });
  it("is deterministic for a reordered input with tied synthetic scores", () => {
    expect(buildOfflineBrainMixedFeedV2([...candidates].reverse(), brains, options))
      .toEqual(buildOfflineBrainMixedFeedV2(candidates, brains, options));
  });
  it("excludes caller-marked ineligible or low-quality items in this fixture", () => {
    const ids = buildOfflineBrainMixedFeedV2(candidates, brains, options).map(x => x.candidate.id);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect(ids).not.toContain("p-0");
    expect(ids).not.toContain("p-1");
  });
  it("rejects missing linked graphs rather than inventing a graph score", () => {
    expect(() => buildOfflineBrainMixedFeedV2(candidates, [], options)).toThrow(RangeError);
  });
});
