import {describe, expect, it} from "vitest";
import {hideCachedVoteDetailsV1} from "./vote-display-privacy";
import type {Post} from "./types";
const post = {id:"p",userId:"author",topicId:"topic",content:"synthetic",createdAt:1,commentCount:0,upvotes:11,reactions:{upvote:11,downvote:9,like:4,love:2,repost:3},userReactions:{upvote:["previous-account"]}} as Post;
describe("cached vote display privacy",()=>{
  it("does not expose cached totals or another account's vote selection",()=>{
    const result = hideCachedVoteDetailsV1([post])[0];
    expect(result.reactions).toEqual({repost:3});
    expect(result.userReactions).toBeUndefined(); expect(result.upvotes).toBeUndefined();
    expect(post.userReactions).toEqual({upvote:["previous-account"]}); expect(post.reactions.upvote).toBe(11);
  });
  it("does not mutate the caller's posts",()=>{const before=structuredClone(post); hideCachedVoteDetailsV1([post]);expect(post).toEqual(before);});
});
