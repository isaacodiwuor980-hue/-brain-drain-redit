import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
describe("home feed startup", () => {
  it("does not automatically create starter posts or topics", () => {
    const source = readFileSync(new URL("./HomeFeed.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("COLD_START_POSTS");
    expect(source).not.toContain("SEED_TOPICS");
    expect(source).not.toContain("seedData");
  });
});
