import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db=vi.hoisted(()=>({insert:vi.fn(),isConfigured:vi.fn(()=>true)}));
vi.mock("../lib/supabase",()=>({supabase:db,SupabaseError:class extends Error { constructor(public status:number,public body:unknown){super("upstream");} }}));
vi.mock("../lib/logger",()=>({logger:{warn:vi.fn()}}));
vi.mock("../middleware/auth",()=>({requireAuth(req:express.Request,_res:express.Response,next:express.NextFunction){req.auth={uid:"firebase-subject"};next();}}));
import router from "./discover";
import { SupabaseError } from "../lib/supabase";
let server:Server,base:string;
beforeAll(async()=>{const app=express();app.use(express.json());app.use("/api",router);await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});const address=server.address();if(!address||typeof address==="string")throw new Error("No port");base=`http://127.0.0.1:${address.port}`;});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
beforeEach(()=>{vi.clearAllMocks();db.isConfigured.mockReturnValue(true);});
async function follow(){return fetch(`${base}/api/discover/follow`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({userId:"00000000-0000-4000-8000-000000000001"})});}
describe("follow storage failure with mocked auth and storage",()=>{
  it("does not report success if the follow table is absent",async()=>{
    db.insert.mockRejectedValueOnce(new SupabaseError(404,"PGRST205"));
    const res=await follow();expect(res.status).toBe(503);expect(await res.json()).toEqual({error:"Follow service unavailable"});
  });
  it("does not report success on other storage errors",async()=>{
    db.insert.mockRejectedValueOnce(new Error("private upstream content"));const res=await follow();expect(res.status).toBe(502);expect(JSON.stringify(await res.json())).not.toContain("private");
  });
});
