import { describe, expect, it } from "vitest";
import { authorityComposite, badFaithPenalty, bridgingBonusV2, canStakeDetailed, clamp01, detectRings, discussionDepth, effectiveMassV2, fromFixed, fromFixedV2, jaccard, quantizeCommentScore, ringIdentityOverlap, toFixed, toFixedV2, winningClusters } from "./index";

describe("TSRG v2 isolated helpers", () => {
  it("adds saturation without changing strict legacy semantics", () => {
    expect(toFixedV2(NaN)).toBe(0n);
    expect(toFixedV2(257)).toBe(toFixed(256));
    expect(toFixedV2(-257)).toBe(toFixed(-256));
    expect(fromFixedV2(1n << 54n)).toBe(2_097_152);
    expect(fromFixedV2(-(1n << 54n))).toBe(-2_097_152);
    expect(() => toFixed(NaN)).toThrow();
    expect(() => fromFixed(1n << 54n)).toThrow();
  });
  it("enforces tier bounds and rejects non-finite identity data", () => {
    expect(canStakeDetailed(0.1, "mouth", 20)).toEqual({ allowed: false, reason: "AUTHORITY_TOO_LOW" });
    expect(canStakeDetailed(0.4, "house", 20)).toEqual({ allowed: false, reason: "TIER_CAP_EXCEEDED (max: lunch)" });
    expect(canStakeDetailed(0.4, "lunch", 20).allowed).toBe(true);
    expect(canStakeDetailed(0.9, "life", NaN).allowed).toBe(false);
    expect(effectiveMassV2("mouth", NaN, 20, false, false)).toBe(0n);
    expect(effectiveMassV2("life", 0.8, 20, false, false)).toBeGreaterThan(effectiveMassV2("life", 0.8, 20, true, true));
  });
  it("bounds authority and uses only eligible clusters and measured gaps", () => {
    expect(clamp01(NaN)).toBe(0);
    expect(authorityComposite(1, 1, 1)).toBe(1);
    expect([...winningClusters(new Set(["a", "b"]), new Set(["b"]))]).toEqual(["a"]);
    expect(bridgingBonusV2(new Set(["a", "b"]), new Set(), null)).toBe(1);
    expect(bridgingBonusV2(new Set(["a", "b"]), new Set(), 30)).toBe(1.35);
    expect(discussionDepth(0, 0)).toBe(0);
  });
  it("scores text overlap, penalizes unique cross-cluster flags and orders buckets", () => {
    expect(jaccard("", "" )).toBe(0);
    expect(jaccard("testing example", "example testing")).toBe(1);
    const flags = Array.from({ length: 5 }, (_, i) => ({ flaggerId: String(i), flaggerAuthority: 1, flaggerCluster: "other" }));
    expect(badFaithPenalty(flags, "self")).toBe(0.4);
    expect(badFaithPenalty(flags, "other")).toBe(0);
    expect([NaN, 0, 0.2, 0.4, 0.6, 0.8].map(quantizeCommentScore)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("does not inflate ring density with duplicate or self edges", () => {
    const edges = Array.from({ length: 20 }, () => ({ u1: "a", u2: "b", weight: 1 }));
    expect(detectRings([...edges, { u1: "c", u2: "c", weight: 1 }], 3)).toEqual([]);
    expect(detectRings([{ u1: "a", u2: "b", weight: 1 }, { u1: "b", u2: "c", weight: 1 }, { u1: "a", u2: "c", weight: 1 }], 3)[0].clusteringCoeff).toBe(1);
    const now = new Date("2026-01-01T00:00:00Z");
    expect(ringIdentityOverlap(new Set(["a", "b"]), [{ members: new Set(["a", "b"]), flaggedAt: now }], now)).toBe(true);
    expect(ringIdentityOverlap(new Set(), [{ members: new Set(["a"]), flaggedAt: now }], now)).toBe(false);
  });
});
