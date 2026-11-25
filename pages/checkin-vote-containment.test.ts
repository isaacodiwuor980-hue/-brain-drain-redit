import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("community check-in vote containment", () => {
  it("does not construct a local check-in vote writer or expose cached selections", () => {
    const source = readFileSync(new URL("./CommunityPage.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/toggleCheckinVote|updateCheckin\(/);
    expect(source).not.toMatch(/c\.(?:myUpvote|myDownvote|upvotes|downvotes)/);
  });
});
