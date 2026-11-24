import { describe, expect, it } from "vitest";
import { reconcileCachedCloudPost } from "./feed-cache-reconcile";
import type { Post } from "./types";

const post = (overrides: Partial<Post> = {}): Post => ({
  id: "post-1", userId: "user-1", topicId: "topic-1", content: "example",
  brainId: "public-brain", createdAt: 1, reactions: { upvote: 0, downvote: 0, repost: 0 },
  commentCount: 0, repostCount: 0, ...overrides,
} as Post);

describe("cloud feed cache reconciliation", () => {
  it("persists server redaction and fresh content while preserving local reactions", () => {
    const cached = post({ brainId: "formerly-public", content: "old", userReactions: { upvote: ["local"] } });
    const server = post({ brainId: null as never, content: "new" });
    const result = reconcileCachedCloudPost(server, cached);
    expect(result.brainId).toBeNull();
    expect(result.content).toBe("new");
    expect(result.userReactions).toEqual({ upvote: ["local"] });
  });
  it("uses the server post unchanged when there is no local reaction", () => {
    const server = post({ content: "new" });
    expect(reconcileCachedCloudPost(server, post({ content: "old" }))).toEqual(server);
    expect(reconcileCachedCloudPost(server, undefined)).toEqual(server);
  });
});
