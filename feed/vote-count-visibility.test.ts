import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("feed vote control markup", () => {
  it("does not render post upvote or downvote counts", () => {
    const source = readFileSync(new URL("./PostCard.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/\{getPost(?:Upvote|Downvote)Count\(post\)\}/);
  });
  it("does not render comment net or classification vote totals", () => {
    const source = readFileSync(new URL("./CommentThread.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("{(node.upvotes ?? 0) - (node.downvotes ?? 0)}");
    expect(source).not.toContain("{node.houseVotes}");
    expect(source).not.toContain("{node.mouthVotes}");
  });
});
