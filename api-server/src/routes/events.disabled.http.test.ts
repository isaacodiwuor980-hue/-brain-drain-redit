import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import express from "express";
import type {Server} from "node:http";
const mock = vi.hoisted(() => ({store:vi.fn(), info:vi.fn(), error:vi.fn()}));
vi.mock("../lib/analytics-store", () => ({storeAnalyticsEvents:mock.store}));
vi.mock("../lib/logger", () => ({logger:{info:mock.info,error:mock.error}}));
import router from "./events";
let server:Server, base:string;
beforeAll(async()=>{const app=express();app.use(express.json());app.use("/api",router);await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve)});const address=server.address();if(!address||typeof address==="string") throw new Error("No port");base=`http://127.0.0.1:${address.port}`;});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));});
beforeEach(()=>vi.clearAllMocks());
describe("server analytics containment",()=>{
  it.each(["page_view", "post_reaction", "comment_reaction"])("refuses %s events without storing or logging sensitive fields",async type=>{
    const event={id:"synthetic-id",type,sessionId:"synthetic-session",createdAt:1,route:"/posts/synthetic-private",payload:{vote:"upvote",userId:"synthetic-voter"}};
    for(let attempt=0;attempt<2;attempt++) {
      const response=await fetch(`${base}/api/events`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({events:[event]})});
      expect(response.status).toBe(403); expect(await response.json()).toEqual({accepted:0,error:"Analytics temporarily unavailable"});
    }
    expect(mock.store).not.toHaveBeenCalled(); expect(mock.info).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled();
  });
});
