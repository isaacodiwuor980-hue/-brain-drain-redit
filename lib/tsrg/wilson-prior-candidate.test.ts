import { describe, expect, it } from "vitest";
import { FIXED_SCALE, SENTINEL_INVALID, toFixed, wilsonLowerBound } from "./index";
import { wilsonPriorCandidateV3 } from "./wilson-prior-candidate";

describe("offline alternative: consistent prior sample size", () => {
  it("preserves the existing low-vote result for comparison while fixing the demonstrated direction for nonempty inputs", () => {
    const up = toFixed(0.35), down = toFixed(1.95);
    expect(wilsonLowerBound(up, down)).toBeGreaterThan(wilsonLowerBound(up, 0n));
    expect(wilsonPriorCandidateV3(up, down)).toBeLessThan(wilsonPriorCandidateV3(up, 0n));
    expect(wilsonPriorCandidateV3(up, down)).not.toBe(wilsonLowerBound(up, down));
  });
  it("returns zero for no votes and quarantines invalid and unsafe fixed totals", () => {
    expect(wilsonPriorCandidateV3(0n, 0n)).toBe(0);
    expect(wilsonPriorCandidateV3(-1n, 0n)).toBe(SENTINEL_INVALID);
    expect(wilsonPriorCandidateV3(0n, -1n)).toBe(SENTINEL_INVALID);
    expect(wilsonPriorCandidateV3(BigInt(Number.MAX_SAFE_INTEGER), 1n)).toBe(SENTINEL_INVALID);
  });
  it("is bounded and moves in the expected direction across 10,000 synthetic nonempty input pairs", () => {
    let seed = 113;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let i = 0; i < 10_000; i++) {
      const up = BigInt(Math.floor(random() * 20 * Number(FIXED_SCALE)));
      const down = BigInt(Math.floor(random() * 20 * Number(FIXED_SCALE))) + 1n;
      const delta = BigInt(Math.floor(random() * Number(FIXED_SCALE))) + 1n;
      const value = wilsonPriorCandidateV3(up, down);
      expect(Number.isFinite(value) && value >= 0 && value <= 1).toBe(true);
      expect(wilsonPriorCandidateV3(up + delta, down)).toBeGreaterThanOrEqual(value - 1e-12);
      expect(wilsonPriorCandidateV3(up, down + delta)).toBeLessThanOrEqual(value + 1e-12);
    }
  });
  it("does not manufacture truth when a knowledgeable minority is outweighed", () => {
    // Synthetic fixture: one correct, fully trusted Life up-voter (mass 3)
    // against 99 incorrect, minimum-authority Mouth down-voters (99 × .25).
    // Eligibility and real expertise are not established by this arithmetic.
    const correctSide = toFixed(3), wrongSide = toFixed(24.75);
    expect(wilsonPriorCandidateV3(correctSide, wrongSide)).toBeLessThan(wilsonPriorCandidateV3(wrongSide, correctSide));
  });
  it("documents the zero-vote exception and the prior's positive down-only score", () => {
    expect(wilsonPriorCandidateV3(0n, 0n)).toBe(0);
    expect(wilsonPriorCandidateV3(0n, 1n)).toBeGreaterThan(0);
  });
});
