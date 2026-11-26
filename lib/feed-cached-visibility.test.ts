import { describe, expect, it } from "vitest";
import { hideUnverifiedCachedBrainLinks } from "./feed-cached-visibility";
import type { Post } from "./types";

describe("cached feed link visibility", () => {
  it("hides unverified brain links without mutating cached posts or content", () => {
    const original = { id: "one", brainId: "old-public-brain", content: "example" } as Post;
    const [shown] = hideUnverifiedCachedBrainLinks([original]);
    expect(shown.brainId).toBeUndefined();
    expect(shown.content).toBe("example");
    expect(original.brainId).toBe("old-public-brain");
  });
  it("leaves posts without links usable", () => {
    const original = { id: "two", content: "local draft" } as Post;
    expect(hideUnverifiedCachedBrainLinks([original])).toEqual([original]);
  });
});
