import {describe,expect,it} from "vitest";
import {summarizeOwnedQueue,type QueuedAction} from "./offline-sync";
const make=(id:string,ownerId?:string,held=false):QueuedAction=>({id,ownerId,type:"create_post",payload:{postId:id},createdAt:1,retryCount:0,...(held?{nextAttemptAt:Number.MAX_SAFE_INTEGER}:{})});
describe("account-scoped sync summary",()=>{
  it("counts only the current account and includes held work needing attention",()=>{
    const pending=[make("a","alice"),make("held","alice",true),make("b","bob"),make("legacy")];
    const dead=[make("ad","alice"),make("bd","bob"),make("old")];
    expect(summarizeOwnedQueue(pending,dead,"alice")).toEqual({pending:2,attention:2});
    expect(summarizeOwnedQueue(pending,dead,"bob")).toEqual({pending:1,attention:1});
    expect(summarizeOwnedQueue(pending,dead,null)).toEqual({pending:0,attention:0});
  });
});
