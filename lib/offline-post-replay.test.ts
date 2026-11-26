import {describe,expect,it} from "vitest";
import {validateOfflinePostReplay} from "./offline-post-replay";
import type {QueuedAction} from "./offline-sync";
import type {Post} from "./types";
const action:QueuedAction={id:"queue-1",type:"create_post",ownerId:"alice",payload:{postId:"post-1"},createdAt:1,retryCount:0};
const post={id:"post-1",userId:"alice",content:"synthetic"} as Post;
describe("offline post replay account safeguards",()=>{
  it("allows matching account and post, and holds absent work for review",()=>{
    expect(validateOfflinePostReplay(action,post,"alice")).toBe(post);
    expect(()=>validateOfflinePostReplay(action,undefined,"alice")).toThrow();
  });
  it("rejects a different owner, mismatched post ID or unowned work",()=>{
    for(const [queued,cached,active] of [
      [action,{...post,userId:"bob"},"alice"],
      [action,{...post,id:"post-2"},"alice"],
      [action,post,"bob"],
      [{...action,ownerId:undefined},post,"alice"],
    ] as Array<[QueuedAction,Post,string]>) expect(()=>validateOfflinePostReplay(queued,cached,active)).toThrow();
  });
  it("rejects malformed post IDs instead of silently treating them as synced",()=>{
    expect(()=>validateOfflinePostReplay({...action,payload:{}},undefined,"alice")).toThrow();
  });
});
