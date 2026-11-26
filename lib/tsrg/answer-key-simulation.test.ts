import { describe, expect, it } from "vitest";
import { runAnswerKeySimulation } from "../../scripts/test/tsrg-answer-key-simulation";

describe("known-answer synthetic benchmark", () => {
  it("is reproducible, accounts for every outcome and includes a fooled-majority case", () => {
    const results = runAnswerKeySimulation(200);
    expect(runAnswerKeySimulation(200)).toEqual(results);
    expect(results).toHaveLength(4);
    for (const scenario of results) for (const method of [scenario.binary, scenario.legacy, scenario.candidate]) {
      expect(method.correct + method.incorrect + method.ties + method.invalid).toBe(200);
      expect(method.invalid).toBe(0);
    }
    const fooled = results.find(result => result.scenario === "one_expert_majority_fooled")!;
    // Designed to expose the limit of finite authority weights, not certify truth.
    expect(fooled.legacy.incorrect).toBeGreaterThan(190);
    expect(fooled.candidate.incorrect).toBeGreaterThan(190);
  });
  it("rejects invalid test parameters", () => {
    for (const n of [0, -1, 1.5, NaN, 100_001]) expect(() => runAnswerKeySimulation(n)).toThrow(RangeError);
    expect(() => runAnswerKeySimulation(1, -1)).toThrow(RangeError);
  });
});
