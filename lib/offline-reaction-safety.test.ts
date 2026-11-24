import {describe,expect,it} from "vitest";
import {requiresManualSyncReview,type QueuedAction} from "./offline-sync";
const action=(type:QueuedAction["type"]):QueuedAction=>({id:"synthetic",type,ownerId:"synthetic-user",payload:{postId:"post-1"},createdAt:1,retryCount:0});
describe("non-idempotent offline actions",()=>{
  it("holds reaction toggles instead of automatically replaying an ambiguous request",()=>{
    expect(requiresManualSyncReview(action("post_reaction"))).toBe(true);
  });
  it("does not change the handling of unrelated action types",()=>{
    expect(requiresManualSyncReview(action("create_post"))).toBe(false);
    expect(requiresManualSyncReview(action("update_brain"))).toBe(false);
  });
});
