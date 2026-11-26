import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectChronologicalHomePosts } from "./home-feed-chronological";
import type { Post } from "./types";

const posts = [
  {id: "old", topicId:"t1", createdAt: 1, reactions: {upvote:999}},
  {id: "new", topicId:"t1", createdAt: 10, reactions: {downvote:999}},
  {id: "other", topicId:"t2", createdAt: 11},
] as Post[];
describe("home feed chronological integration gate", () => {
  it("ignores vote counts and behavioral ranking, filters by requested topic, preserves input", () => {
    const before = structuredClone(posts);
    expect(selectChronologicalHomePosts(posts, "t1", null, 10).map(p => p.id)).toEqual(["new", "old"]);
    expect(selectChronologicalHomePosts(posts, null, "old", 10).map(p => p.id)).toEqual(["old"]);
    expect(selectChronologicalHomePosts(posts, null, null, 2).map(p => p.id)).toEqual(["other", "new"]);
    expect(posts).toEqual(before);
  });
  it("is actually used by HomeFeed and does not call behavioral rankers", () => {
    const source = readFileSync(new URL("../pages/HomeFeed.tsx", import.meta.url), "utf8");
    expect(source).toContain("selectChronologicalHomePosts(");
    expect(source).not.toContain("rankHomeFeedPosts(");
    expect(source).not.toContain("rankRelatedTopics(");
  });
});

it("excludes malformed timestamps and refuses invalid limits without changing input", () => {
  const input = [
    {id:"invalid-nan", createdAt:NaN}, {id:"invalid-null", createdAt:null},
    {id:"z", createdAt:10}, {id:"a", createdAt:10}, {id:"bad-infinite", createdAt:Infinity},
    {id:"old", createdAt:1},
  ] as unknown as Post[];
  expect(selectChronologicalHomePosts(input, null, null, 5).map(p=>p.id)).toEqual(["a","z","old"]);
  expect(selectChronologicalHomePosts(input, null, null, -1)).toEqual([]);
  expect(selectChronologicalHomePosts(input, null, null, NaN)).toEqual([]);
  expect(input).toHaveLength(6);
});
