import { describe, expect, it } from "vitest";
import { rankOfflinePersonalizedV3 } from "./personalized-feed-v3";
import type { FeedCandidate } from "./feed-pipeline";

const candidates: FeedCandidate[] = [
  { id: "art-1", topic: "art", author: "a", source: "s", signals: { quality: 0.5, relevance: 0.5 } },
  { id: "code-1", topic: "coding", author: "b", source: "s", signals: { quality: 0.5, relevance: 0.5 } },
];

describe("offline personalized feed comparison", () => {
  it("ranks the user's preferred topic above an equally rated other topic", () => {
    const result = rankOfflinePersonalizedV3(candidates, { seed: 4, personalized: true, interests: new Map([["coding", 0.9], ["art", 0.2]]), qualityWeight: 0.4 });
    expect(result[0].id).toBe("code-1");
    expect(candidates.map(c => c.id)).toEqual(["art-1", "code-1"]);
  });
  it("does not read or use interests when personalization is off", () => {
    const unreadable = new Proxy(new Map<string, number>(), { get() { throw new Error("interests accessed"); } });
    const off = rankOfflinePersonalizedV3(candidates, { seed: 4, personalized: false, interests: unreadable, qualityWeight: 0.4 });
    const noData = rankOfflinePersonalizedV3(candidates, { seed: 4, personalized: false, qualityWeight: 0.4 });
    expect(off).toEqual(noData);
  });
  it("uses neutral interest for unknown topics and remains stable for shuffled inputs", () => {
    const options = { seed: 42, personalized: true, interests: new Map<string, number>(), qualityWeight: 0.4 };
    expect(rankOfflinePersonalizedV3(candidates, options)).toEqual(rankOfflinePersonalizedV3([...candidates].reverse(), options));
    expect(rankOfflinePersonalizedV3([], options)).toEqual([]);
  });
  it("rejects invalid weights and invalid enabled-interest inputs", () => {
    for (const qualityWeight of [-0.1, 1.1, NaN]) expect(() => rankOfflinePersonalizedV3(candidates, { seed: 1, personalized: false, qualityWeight })).toThrow(RangeError);
    for (const score of [-1, 2, NaN, Infinity]) expect(() => rankOfflinePersonalizedV3(candidates, { seed: 1, personalized: true, interests: new Map([["coding", score]]), qualityWeight: 0.5 })).toThrow(RangeError);
    expect(() => rankOfflinePersonalizedV3(candidates, { seed: 1, personalized: true, qualityWeight: 0.5 })).toThrow(RangeError);
  });
});
