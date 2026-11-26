import { describe, expect, it } from "vitest";
import { aggregateStakeMassV3, type VerifiedStakeV3 } from "./stake-aggregate";

const vote = (overrides: Partial<VerifiedStakeV3> = {}): VerifiedStakeV3 => ({
  voterId: "voter-1", tag: "coding", direction: "up", tier: "mouth", authority: 0.2, ageDays: 30, brigade: false, ring: false, ...overrides,
});
describe("offline tag-scoped stake mass aggregate", () => {
  it("adds explicit tier and authority weighted mass and calculates Wilson once", () => {
    const low = aggregateStakeMassV3("coding", [vote()]);
    const high = aggregateStakeMassV3("coding", [vote({ tier: "life", authority: 0.8 })]);
    expect(high.upMass).toBeGreaterThan(low.upMass);
    expect(high.downMass).toBe(0n);
    expect(high.wilson).toBeGreaterThan(low.wilson);
    expect(aggregateStakeMassV3("coding", []).wilson).toBe(0);
  });
  it("preserves exact mass independently of order and reflects risk flags", () => {
    const votes = [vote(), vote({ voterId: "voter-2", direction: "down", tier: "house", authority: 0.8 }), vote({ voterId: "voter-3", tier: "lunch", brigade: true })];
    expect(aggregateStakeMassV3("coding", votes)).toEqual(aggregateStakeMassV3("coding", [...votes].reverse()));
    expect(aggregateStakeMassV3("coding", [votes[0], votes[1]]).downMass).toBeGreaterThan(0n);
    expect(aggregateStakeMassV3("coding", [votes[2]]).upMass).toBeLessThan(aggregateStakeMassV3("coding", [{ ...votes[2], brigade: false }]).upMass);
  });
  it("documents that the existing Wilson helper can increase with opposition at small mass", () => {
    const up = vote();
    const down = vote({ voterId: "voter-2", direction: "down", tier: "house", authority: 0.8 });
    expect(aggregateStakeMassV3("coding", [up, down]).wilson).toBeGreaterThan(aggregateStakeMassV3("coding", [up]).wilson);
    expect(aggregateStakeMassV3("coding", [down]).wilson).toBeGreaterThan(0);
  });
  it("rejects duplicate voters, wrong tags, and malformed inputs", () => {
    expect(() => aggregateStakeMassV3("coding", [vote(), vote({ direction: "down" })])).toThrow(RangeError);
    expect(() => aggregateStakeMassV3("coding", [vote({ tag: "gaming" })])).toThrow(RangeError);
    for (const invalid of [vote({ authority: NaN }), vote({ authority: 1.1 }), vote({ ageDays: 0 }), vote({ tier: "invalid" as VerifiedStakeV3["tier"] }), vote({ direction: "invalid" as VerifiedStakeV3["direction"] }), vote({ brigade: 1 as unknown as boolean })]) {
      expect(() => aggregateStakeMassV3("coding", [invalid])).toThrow(RangeError);
    }
    expect(() => aggregateStakeMassV3("", [])).toThrow(RangeError);
  });
});
