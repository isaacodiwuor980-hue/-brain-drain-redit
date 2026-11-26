import { describe, expect, it } from "vitest";
import { authorityTier, authorityTierV2, canStakeDetailed, canStakeDetailedV2, authorityComposite, authorityCompositeV2 } from "./index";
describe("unwired authority refinements", () => {
  it("preserves legacy behavior while V2 admits baseline Mouth only", () => {
    expect(authorityTier(0.1)).toBe(0);
    expect(canStakeDetailed(0.1, "mouth", 30).allowed).toBe(false);
    expect(authorityTierV2(0.1)).toBe(1);
    expect(canStakeDetailedV2(0.1, "mouth", 30).allowed).toBe(true);
    for (const tier of ["lunch", "house", "life"] as const) expect(canStakeDetailedV2(0.1, tier, 30).allowed).toBe(false);
  });
  it("enforces eligibility boundaries and invalid values", () => {
    expect(authorityTierV2(0.0999)).toBe(0); expect(authorityTierV2(0.1)).toBe(1);
    expect(authorityTierV2(0.35)).toBe(2); expect(authorityTierV2(0.55)).toBe(3); expect(authorityTierV2(0.75)).toBe(4);
    expect(canStakeDetailedV2(0.1, "mouth", 0).allowed).toBe(false);
    expect(canStakeDetailedV2(NaN, "mouth", 30).allowed).toBe(false);
    expect(canStakeDetailedV2(1.1, "life", 30).allowed).toBe(false);
    expect(canStakeDetailedV2(0.5, "invalid" as never, 30).allowed).toBe(false);
  });
  it("provides a floor and gives declarations and views no input or weight", () => {
    expect(authorityComposite(0, 0, 0)).toBe(0);
    expect(authorityComposite(0, 1, 0)).toBe(0.3);
    expect(authorityCompositeV2(0, 0)).toBe(0.1);
    expect(authorityCompositeV2(1, 1)).toBeCloseTo(0.7);
    // Extra attacker-controlled inputs are ignored at runtime.
    const withExtraInputs = authorityCompositeV2 as (...args: number[]) => number;
    expect(withExtraInputs(0, 0, 1, 1)).toBe(0.1);
  });
  it("rejects malformed earned signals and is monotone in earned evidence", () => {
    for (const value of [-1, 1.1, NaN, Infinity]) expect(() => authorityCompositeV2(value, 0)).toThrow(RangeError);
    expect(authorityCompositeV2(0.7, 0.5)).toBeGreaterThanOrEqual(authorityCompositeV2(0.5, 0.5));
    expect(authorityCompositeV2(0.5, 0.7)).toBeGreaterThanOrEqual(authorityCompositeV2(0.5, 0.5));
  });
});
