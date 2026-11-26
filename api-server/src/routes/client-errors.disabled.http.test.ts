import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const log=vi.hoisted(()=>({error:vi.fn()}));
vi.mock("../lib/logger",()=>({logger:log}));
import router from "./client-errors";
let server:Server, base:string;
beforeAll(async()=>{const app=express();app.use(express.json());app.use("/api",router);await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});const addr=server.address();if(!addr||typeof addr==="string") throw new Error("no port");base=`http://127.0.0.1:${addr.port}`;});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
beforeEach(()=>vi.clearAllMocks());
describe("unreviewed client error ingestion",()=>{
  it("rejects sensitive error bodies without logging them",async()=>{
    const response=await fetch(`${base}/api/client-errors`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:"synthetic-voter-and-vote",stack:"synthetic-private"})});
    expect(response.status).toBe(403);expect(response.headers.get("cache-control")).toBe("no-store");expect(log.error).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("synthetic-");
  });
});
