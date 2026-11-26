import { describe, expect, it } from "vitest";
import { buildOfflineChronologicalFallbackV1 } from "./chronological-fallback-v1";

const candidates = [
  { id: "c", publishedAt: "2026-01-01T00:00:00.000Z", visibility: "allowed", topicVerified: true },
  { id: "b", publishedAt: "2026-01-02T00:00:00.000Z", visibility: "allowed", topicVerified: true },
  { id: "a", publishedAt: "2026-01-02T00:00:00.000Z", visibility: "allowed", topicVerified: true },
  { id: "private", publishedAt: "2026-01-03T00:00:00.000Z", visibility: "denied", topicVerified: true },
  { id: "unknown", publishedAt: "2026-01-04T00:00:00.000Z", visibility: "unknown", topicVerified: true },
  { id: "topic", publishedAt: "2026-01-05T00:00:00.000Z", visibility: "allowed", topicVerified: false },
] as const;

describe("offline chronological fallback", () => {
  it("uses only caller-marked allowed, topic-verified posts, newest first with stable ID tie break", () => {
    expect(buildOfflineChronologicalFallbackV1(candidates, 10).map(c => c.id)).toEqual(["a", "b", "c"]);
    expect(buildOfflineChronologicalFallbackV1([...candidates].reverse(), 10).map(c => c.id)).toEqual(["a", "b", "c"]);
  });
  it("limits results without mutating inputs", () => {
    const before = structuredClone(candidates);
    expect(buildOfflineChronologicalFallbackV1(candidates, 2).map(c => c.id)).toEqual(["a", "b"]);
    expect(candidates).toEqual(before);
    expect(buildOfflineChronologicalFallbackV1(candidates, 0)).toEqual([]);
  });
  it("rejects invalid timestamps, identifiers, decisions and duplicate IDs", () => {
    expect(() => buildOfflineChronologicalFallbackV1([{...candidates[0], publishedAt: "2026-02-30T00:00:00.000Z"}], 10)).toThrow(RangeError);
    expect(() => buildOfflineChronologicalFallbackV1([{...candidates[0], visibility: "maybe"}], 10)).toThrow(RangeError);
    expect(() => buildOfflineChronologicalFallbackV1([...candidates, candidates[0]], 10)).toThrow(RangeError);
    expect(() => buildOfflineChronologicalFallbackV1([{...candidates[0], id: ""}], 10)).toThrow(RangeError);
    expect(() => buildOfflineChronologicalFallbackV1(candidates, 101)).toThrow(RangeError);
  });
});
