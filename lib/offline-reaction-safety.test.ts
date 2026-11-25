import {describe,expect,it} from "vitest";
import {requiresManualSyncReview,type QueuedAction} from "./offline-sync";
const action=(type:QueuedAction["type"]):QueuedAction=>({id:"synthetic",type,ownerId:"synthetic-user",payload:{postId:"post-1"},createdAt:1,retryCount:0});
describe("non-idempotent offline actions",()=>{
  it("holds reaction toggles instead of automatically replaying an ambiguous request",()=>{
    expect(requiresManualSyncReview(action("post_reaction"))).toBe(true);
  });
  it("holds offline posts and brain edits until safe review and server safeguards exist",()=>{
    expect(requiresManualSyncReview(action("create_post"))).toBe(true);
    expect(requiresManualSyncReview(action("update_brain"))).toBe(true);
  });
  it("does not change unrelated action handling",()=>{
    expect(requiresManualSyncReview(action("add_comment"))).toBe(false);
    expect(requiresManualSyncReview(action("save_profile"))).toBe(false);
  });
});
