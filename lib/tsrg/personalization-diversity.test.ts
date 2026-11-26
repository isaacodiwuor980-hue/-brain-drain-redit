import { expect, it } from "vitest";
import { runPersonalizationSimulation } from "../../scripts/test/personalization-synthetic";

it("compares preferred-topic concentration with best-effort diversity", () => {
  const result = runPersonalizationSimulation(300);
  const warm = result.groups.warm as typeof result.groups.warm & { diversifiedPreferenceSlots: number; diversifiedDistinctTopics: number };
  expect(result.invalid).toBe(0);
  expect(warm.diversifiedPreferenceSlots).toBe(300);
  expect(warm.diversifiedPreferenceSlots).toBeLessThan(warm.preferenceSlots);
  expect(warm.diversifiedDistinctTopics).toBeGreaterThanOrEqual(warm.distinctTopics);
});
