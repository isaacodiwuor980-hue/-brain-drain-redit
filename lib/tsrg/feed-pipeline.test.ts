import { describe, expect, it } from "vitest";
import { buildOfflineFeed, type FeedCandidate } from "./feed-pipeline";

const candidates: FeedCandidate[] = [
  { id: "one", topic: "science", author: "alice", source: "circle", signals: { quality: 0.7, relevance: 0.8 } },
  { id: "two", topic: "art", author: "bob", source: "other", signals: { quality: 0.7, relevance: 0.8 } },
  { id: "three", topic: "science", author: "carol", source: "other", signals: { quality: 0.9, relevance: 0.9 } },
];
const rules = (c: FeedCandidate) => (c.signals.quality + c.signals.relevance) / 2;

describe("isolated replaceable feed ordering", () => {
  it("returns deterministic output for shuffled inputs across 100 runs", () => {
    const expected = buildOfflineFeed(candidates, { seed: 42, rules }).map(c => c.id);
    for (let i = 0; i < 100; i++) {
      const input = i % 2 ? [...candidates].reverse() : candidates;
      expect(buildOfflineFeed(input, { seed: 42, rules }).map(c => c.id)).toEqual(expected);
    }
    expect(expected[0]).toBe("three");
  });
  it("allows an optional model to blend and falls back to rules for all candidates if it fails", () => {
    const base = buildOfflineFeed(candidates, { seed: 1, rules });
    const blended = buildOfflineFeed(candidates, { seed: 1, rules, modelWeight: 1, model: c => c.id === "one" ? 1 : 0 });
    expect(blended[0].id).toBe("one");
    expect(buildOfflineFeed(candidates, { seed: 1, rules, modelWeight: 0.5, model: () => { throw new Error("private error"); } })).toEqual(base);
    expect(buildOfflineFeed(candidates, { seed: 1, rules, modelWeight: 0.5, model: () => NaN })).toEqual(base);
  });
  it("rejects invalid rules, IDs, seed, and blend without mutating input", () => {
    const before = JSON.stringify(candidates);
    expect(() => buildOfflineFeed([candidates[0], candidates[0]], { seed: 1, rules })).toThrow(RangeError);
    expect(() => buildOfflineFeed(candidates, { seed: 1, rules: () => Infinity })).toThrow(RangeError);
    expect(() => buildOfflineFeed(candidates, { seed: -1, rules })).toThrow(RangeError);
    expect(() => buildOfflineFeed(candidates, { seed: 1, rules, modelWeight: 2 })).toThrow(RangeError);
    expect(JSON.stringify(candidates)).toBe(before);
    expect(buildOfflineFeed([], { seed: 0, rules })).toEqual([]);
  });
});

describe("model input isolation", () => {
  it("does not let a failing model mutate caller data or the rules fallback", () => {
    const input = candidates.map(c => ({ ...c, signals: { ...c.signals } }));
    const before = JSON.stringify(input);
    const expected = buildOfflineFeed(input, { seed: 2, rules }).map(c => c.id);
    const result = buildOfflineFeed(input, {
      seed: 2, rules, modelWeight: 0.5,
      model: candidate => {
        (candidate.signals as { quality: number }).quality = 0;
        throw new Error("model failed");
      },
    });
    expect(JSON.stringify(input)).toBe(before);
    expect(result.map(c => c.id)).toEqual(expected);
  });
});
