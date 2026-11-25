import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const mock = vi.hoisted(() => ({ store: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("../lib/analytics-store", () => ({storeAnalyticsEvents:mock.store}));
vi.mock("../lib/logger", () => ({logger:{info:mock.info,error:mock.error}}));
import router from "./events";
let server: Server, base: string;
beforeAll(async () => { const app=express(); app.use(express.json()); app.use("/api",router); await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve);}); const address=server.address(); if (!address || typeof address==="string") throw new Error("No port"); base=`http://127.0.0.1:${address.port}`; });
afterAll(async () => { await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve())); });
beforeEach(() => { vi.resetAllMocks(); mock.store.mockResolvedValue({storageMode:"memory"}); });
const event = {id:"synthetic",type:"page_view",sessionId:"session",createdAt:1,route:"/search?private-route#fragment",payload:{Query:"private-query", Search:"?private-search", REFERRER:"https://example.test/private-referrer",path:"/search?private-path#hash",visible:true}};
async function send(events: unknown[]) { return fetch(`${base}/api/events`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({events})}); }
describe("server-side event privacy (mocked storage)", () => {
  it("removes query, search and referrer values and strips route query and hash even for direct clients",async () => {
    expect((await send([event])).status).toBe(202);
    const stored=mock.store.mock.calls[0][0][0]; const json=JSON.stringify(stored);
    for (const secret of ["private-route","private-query","private-search","private-referrer","private-path"]) expect(json).not.toContain(secret);
    expect(stored.route).toBe("/search"); expect(stored.payload.path).toBe("/search"); expect(stored.payload.visible).toBe(true);
    expect(JSON.stringify(mock.info.mock.calls)).not.toContain("private-");
  });
  it("does not log upstream errors that could contain personal data",async () => {
    mock.store.mockRejectedValueOnce(new Error("private-upstream-body")); const response=await send([event]); expect(response.status).toBe(500);
    expect(mock.error).toHaveBeenCalledWith({}, "Failed to store analytics events");
  });
  it("rejects a whole batch containing legacy reaction events without storage or logging payloads", async () => {
    for (const type of ["post_reaction", "comment_reaction"]) {
      const reaction = {...event, type, payload:{postId:"synthetic-post", direction:"upvote", userId:"synthetic-voter"}};
      const response = await send([event, reaction]);
      expect(response.status).toBe(422); expect(await response.json()).toEqual({accepted:0,error:"Reaction analytics unavailable"});
      expect(mock.store).not.toHaveBeenCalled();
      expect(JSON.stringify(mock.info.mock.calls)).not.toContain("synthetic-voter");
    }
  });
  it("rejects invalid event batches before storing them",async () => { expect((await send([{type:"invalid"}])).status).toBe(400); expect(mock.store).not.toHaveBeenCalled(); });
});
