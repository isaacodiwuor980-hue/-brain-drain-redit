import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("unverified search cache containment", () => {
  it("does not load shared post or brain stores into search results", () => {
    const page = readFileSync(new URL("./SearchPage.tsx", import.meta.url), "utf8");
    expect(page).not.toMatch(/idb\.getAll<Brain>\("brains"\)/);
    expect(page).not.toMatch(/idb\.getAll<Post>\("posts"\)/);
    expect(page).not.toMatch(/setBrains\(allBrains/);
    expect(page).not.toMatch(/setPosts\(allPosts/);
    expect(page).toContain("Brain and post search is temporarily unavailable");
  });
});
