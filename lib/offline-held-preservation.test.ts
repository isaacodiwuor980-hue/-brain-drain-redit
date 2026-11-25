import { describe, expect, it, vi } from "vitest";
import { enqueueAction, actionsForOwner, requiresManualSyncReview } from "./offline-sync";

describe("held offline actions", () => {
  it("keeps identifiers distinct if clock and random values collide", () => {
    const clock=vi.spyOn(Date,"now").mockReturnValue(1);
    const random=vi.spyOn(Math,"random").mockReturnValue(0.5);
    try {
      let queue=enqueueAction([], {type:"post_reaction",ownerId:"a",payload:{postId:"p"}});
      queue=enqueueAction(queue, {type:"post_reaction",ownerId:"a",payload:{postId:"p"}});
      expect(new Set(queue.map(action=>action.id)).size).toBe(2);
    } finally { clock.mockRestore(); random.mockRestore(); }
  });
  it("does not coalesce unverified comment or profile actions", () => {
    let queue=enqueueAction([], {type:"add_comment",ownerId:"a",payload:{postId:"p"}});
    queue=enqueueAction(queue, {type:"add_comment",ownerId:"a",payload:{postId:"p"}});
    queue=enqueueAction(queue, {type:"save_profile",ownerId:"a",payload:{}});
    queue=enqueueAction(queue, {type:"save_profile",ownerId:"a",payload:{}});
    expect(queue).toHaveLength(4);
    expect(queue.every(requiresManualSyncReview)).toBe(true);
  });
  it("preserves each uncertain reaction and each conflicting brain version", () => {
    let queue = enqueueAction([], {type:"post_reaction", ownerId:"alice", payload:{postId:"p",reactionType:"upvote"}});
    queue = enqueueAction(queue, {type:"post_reaction", ownerId:"alice", payload:{postId:"p",reactionType:"downvote"}});
    queue = enqueueAction(queue, {type:"update_brain", ownerId:"alice", payload:{brain:{id:"b",title:"first"},nodes:[]}});
    queue = enqueueAction(queue, {type:"update_brain", ownerId:"alice", payload:{brain:{id:"b",title:"second"},nodes:[]}});
    queue = enqueueAction(queue, {type:"post_reaction", ownerId:"bob", payload:{postId:"p",reactionType:"upvote"}});
    expect(queue).toHaveLength(5);
    expect(actionsForOwner(queue,"alice")).toHaveLength(4);
    expect(actionsForOwner(queue,"bob")).toHaveLength(1);
    expect(queue.every(requiresManualSyncReview)).toBe(true);
    expect(queue.slice(0,2).map(a=>a.payload.reactionType)).toEqual(["upvote","downvote"]);
    expect(queue.slice(2,4).map(a=>(a.payload.brain as {title:string}).title)).toEqual(["first","second"]);
  });
});
