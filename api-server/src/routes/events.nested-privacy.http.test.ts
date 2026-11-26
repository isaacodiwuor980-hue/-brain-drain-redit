import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const mock=vi.hoisted(()=>({store:vi.fn()}));
vi.mock("../lib/analytics-store",()=>({storeAnalyticsEvents:mock.store}));
import router from "./events";
let server:Server, base:string;
beforeAll(async()=>{const app=express();app.use(express.json());app.use("/api",router);await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});const address=server.address();if(!address||typeof address==="string") throw new Error("No port");base=`http://127.0.0.1:${address.port}`;});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));});
describe("nested telemetry payload safety",()=>{
  it("rejects nested sensitive values before any storage",async()=>{
    const event={id:"synthetic",type:"page_view",sessionId:"session",createdAt:1,route:"/",payload:{values:[{query:"synthetic-secret"},["nested-secret"]]}};
    const response=await fetch(`${base}/api/events`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({events:[event]})});
    expect(response.status).toBe(403);expect(mock.store).not.toHaveBeenCalled();expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});
