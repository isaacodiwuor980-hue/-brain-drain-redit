import { expect, it } from "vitest";
import { runSimulation } from "../../scripts/test/tsrg-simulation";

it("avoids a large matched-pair exposure imbalance in the synthetic fixture", () => {
  const result = runSimulation(2000);
  expect(result.errors).toBe(0);
  const [a, b] = result.exposureBySyntheticGroup;
  // A diagnostic bound for this matched fixture, not a production fairness guarantee.
  expect(Math.abs(a - b) / (a + b)).toBeLessThan(0.04);
});
