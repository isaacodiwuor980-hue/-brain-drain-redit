import { describe, expect, it } from "vitest";
import { runSimulation } from "../../scripts/test/tsrg-simulation";

describe("synthetic offline TSRG benchmark", () => {
  it("accounts for every requested synthetic user and slot", () => {
    const result = runSimulation(40);
    expect(result.errors).toBe(0);
    expect(result.coldUsers).toBe(20);
    expect(result.matureUsers).toBe(20);
    expect(result.observations).toBe(400);
    expect(result.exposureBySyntheticGroup[0] + result.exposureBySyntheticGroup[1]).toBe(400);
    expect(result.illustrativeAgreementShare).toBeCloseTo(0.8);
    expect(result.coldMeanDistinctTopics).toBeGreaterThan(1);
  });
  it("rejects invalid user counts", () => {
    for (const users of [0, 1, 1.5, NaN, 100_001]) expect(() => runSimulation(users)).toThrow(RangeError);
  });
});
