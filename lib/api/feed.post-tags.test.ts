import { describe, expect, it } from "vitest";
import { toCreatePostInput } from "./feed";
import type { Post } from "../types";
describe("post creation payload for online and offline replay", () => {
  it("preserves post tags and existing fields", () => {
    const post: Post = { id: "p1", userId: "u1", topicId: "coding", content: "Hello", tags: ["coding", "typescript"], postType: "post", reactions: {}, commentCount: 0, createdAt: 1700000000000 };
    expect(toCreatePostInput(post)).toMatchObject({ id: "p1", topicId: "coding", content: "Hello", tags: ["coding", "typescript"], postType: "post", createdAt: 1700000000000 });
  });
});
