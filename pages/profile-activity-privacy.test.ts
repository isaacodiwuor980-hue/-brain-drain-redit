import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("does not render unowned browser activity or fabricated heatmap data on profiles", () => {
  const source = readFileSync(new URL("./ProfilePage.tsx", import.meta.url), "utf8");
  expect(source).not.toContain('idb.getAll');
  expect(source).not.toContain('LEGACY_USER_ID');
  expect(source).not.toContain('generateContributionData');
  expect(source).not.toContain('<ContributionHeatmap');
  expect(source).toContain('Activity is temporarily unavailable');
  expect(source).toContain('Existing device data has not been deleted');
});
