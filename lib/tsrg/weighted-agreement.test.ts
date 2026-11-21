import { describe, expect, it } from "vitest";
import { estimateWeightedAgreement, type AgreementVote } from "./weighted-agreement";
const vote = (direction: AgreementVote["direction"], tier: AgreementVote["tier"], trust = 1): AgreementVote => ({ direction, tier, trust });
describe("isolated weighted agreement arithmetic", () => {
  it("matches the proposed example, without calling it factual accuracy", () => {
    const result = estimateWeightedAgreement([vote("agree", "life"), vote("agree", "life"), ...Array.from({ length: 3 }, () => vote("agree", "house")), vote("disagree", "life"), vote("disagree", "house"), vote("disagree", "house")]);
    expect(result).toMatchObject({ positiveWeight: 17, negativeWeight: 10, voteCount: 8, effectiveWeightedVolume: 27 });
    expect(result!.weightedShare).toBeCloseTo(17 / 27, 10);
    expect(result!.lowerBound * 100).toBeCloseTo(44.2289, 3);
  });
  it("shrinks effective volume without inflating the share when dampened", () => {
    const votes = [vote("agree", "life"), vote("disagree", "mouth")];
    const normal = estimateWeightedAgreement(votes)!;
    const damped = estimateWeightedAgreement(votes, 0.2)!;
    expect(damped.weightedShare).toBeCloseTo(0.8);
    expect(damped.effectiveWeightedVolume).toBeCloseTo(1);
    expect(damped.lowerBound).toBeLessThan(normal.lowerBound);
  });
  it("handles empty, all-positive, all-negative and trust-weighted votes", () => {
    expect(estimateWeightedAgreement([])).toBeNull();
    expect(estimateWeightedAgreement([vote("disagree", "mouth")])!.lowerBound).toBeCloseTo(0);
    const all = estimateWeightedAgreement([vote("agree", "life", 0.1)])!;
    expect(all.positiveWeight).toBeCloseTo(0.4);
    expect(all.weightedShare).toBe(1);
    expect(all.lowerBound).toBeGreaterThan(0);
  });
  it("rejects invalid votes and factors rather than producing misleading scores", () => {
    for (const factor of [0, -1, 1.1, NaN, Infinity, Number.MIN_VALUE]) expect(() => estimateWeightedAgreement([vote("agree", "mouth")], factor)).toThrow(RangeError);
    for (const trust of [0, 0.09, 1.1, NaN, Infinity]) expect(() => estimateWeightedAgreement([vote("agree", "life", trust)])).toThrow(RangeError);
    expect(() => estimateWeightedAgreement([{ direction: "agree", tier: "fake", trust: 1 } as unknown as AgreementVote])).toThrow(RangeError);
    expect(() => estimateWeightedAgreement([{ direction: "fake", tier: "life", trust: 1 } as unknown as AgreementVote])).toThrow(RangeError);
  });
  it("gives repeated consistent evidence a higher lower bound", () => {
    const single = estimateWeightedAgreement([vote("agree", "life")])!;
    const many = estimateWeightedAgreement(Array.from({ length: 50 }, () => vote("agree", "life")))!;
    expect(many.lowerBound).toBeGreaterThan(single.lowerBound);
  });
});
