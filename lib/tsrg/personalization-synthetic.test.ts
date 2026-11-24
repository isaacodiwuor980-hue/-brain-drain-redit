import { expect, it } from "vitest";
import { runPersonalizationSimulation } from "../../scripts/test/personalization-synthetic";

it("accounts for synthetic warm, cold and opt-out users deterministically", () => {
  const result = runPersonalizationSimulation(300);
  expect(runPersonalizationSimulation(300)).toEqual(result);
  expect(result.invalid).toBe(0);
  expect(result.groups.warm.users).toBe(100);
  expect(result.groups.cold.users).toBe(100);
  expect(result.groups.optedOut.users).toBe(100);
  expect(result.groups.warm.preferenceSlots).toBeGreaterThan(result.groups.cold.preferenceSlots);
  for (const group of Object.values(result.groups)) expect(group.distinctTopics).toBeGreaterThan(group.users);
});
