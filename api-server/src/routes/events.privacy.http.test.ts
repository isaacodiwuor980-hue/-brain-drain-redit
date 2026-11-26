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
beforeEach(() => { vi.resetAllMocks(); });
async function send(body: unknown) { return fetch(`${base}/api/events`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}); }
describe("server-side event privacy (mocked storage)", () => {
  it("rejects mixed batches with arbitrary query, route, voter and payload data without storing or logging",async () => {
    const event = {id:"synthetic-voter",type:"page_view",sessionId:"synthetic-session",createdAt:1,route:"/search?private-route",payload:{Query:"private-query",vote:"upvote",userId:"private-voter"}};
    const result=await send({events:[event,{...event,type:"post_reaction"}]});
    expect(result.status).toBe(403);expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({accepted:0,error:"Analytics temporarily unavailable"});
    expect(mock.store).not.toHaveBeenCalled();expect(mock.info).not.toHaveBeenCalled();expect(mock.error).not.toHaveBeenCalled();
  });
  it("rejects malformed payloads without invoking storage",async () => {expect((await send({events:[{type:"invalid"}]})).status).toBe(403);expect(mock.store).not.toHaveBeenCalled();});
});
