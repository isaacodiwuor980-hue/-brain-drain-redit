import { describe, expect, it } from "vitest";
import { orderLiveFeed } from "./live-feed-gate";
import type { Post } from "../types";

describe("live feed ranking containment", () => {
  it("stays chronological even when experimental availability is asserted", () => {
    const posts = [
      {id:"older", createdAt:1, reactions:{upvote:100,downvote:0}},
      {id:"newer", createdAt:2, reactions:{upvote:0,downvote:100}},
    ] as Post[];
    expect(orderLiveFeed(posts, "foryou", true, 3).map(p => p.id)).toEqual(["newer", "older"]);
    expect(posts.map(p => p.id)).toEqual(["older", "newer"]);
    expect(orderLiveFeed(posts, "following", true, 3).map(p => p.id)).toEqual(["newer", "older"]);
  });
});
