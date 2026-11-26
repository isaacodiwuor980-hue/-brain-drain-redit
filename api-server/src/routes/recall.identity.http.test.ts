import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ get: vi.fn(), getOne: vi.fn(), insert: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db, SupabaseError: class extends Error {} }));
vi.mock("../middleware/auth", () => ({ requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const uid = req.header("x-synthetic-user"); if (!uid) { res.status(401).json({error:"Authentication required"}); return; }
  req.auth = {uid}; next();
} }));
import router from "./recall";
const a = "00000000-0000-4000-8000-000000000001", b = "00000000-0000-4000-8000-000000000002";
let server: Server, base: string;
beforeAll(async () => { const app=express();app.use(express.json());app.use("/api",router);await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});const address=server.address();if(!address || typeof address === "string") throw new Error("no port");base=`http://127.0.0.1:${address.port}`; });
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
beforeEach(()=>{vi.resetAllMocks();db.isConfigured.mockReturnValue(true);db.insert.mockResolvedValue(undefined);db.get.mockResolvedValue([]);db.getOne.mockImplementation(async(table:string, opts:{filters:Record<string,string>})=>{if(table!=="user_identity_map")return null;if(opts.filters.firebase_subject==="eq.unavailable") throw new Error("sensitive details");return opts.filters.firebase_subject==="eq.alice"?{supabase_uid:a}:opts.filters.firebase_subject==="eq.bob"?{supabase_uid:b}:null;});});
const get=(path:string,user:string)=>fetch(`${base}/api/recall/${path}`,{headers:{"x-synthetic-user":user}});
const post=(user:string,body:unknown)=>fetch(`${base}/api/recall`,{method:"POST",headers:{"x-synthetic-user":user,"content-type":"application/json"},body:JSON.stringify(body)});
describe("recall identity and privacy (mock auth and storage)",()=>{
  it("rejects unmapped UUID-shaped subjects and mapping failure without accessing events",async()=>{
    expect((await get("history",b)).status).toBe(403); const failed=await post("unavailable",{quality:4}); expect(failed.status).toBe(503);expect(JSON.stringify(await failed.json())).not.toContain("sensitive details");
    expect(db.get).not.toHaveBeenCalled();expect(db.insert).not.toHaveBeenCalled();
  });
  it("uses the mapped owner for writes and reads and marks responses no-store",async()=>{
    const write=await post("alice",{quality:4});expect(write.status).toBe(200);expect(write.headers.get("cache-control")).toBe("no-store");expect(db.insert).toHaveBeenCalledWith("recall_events",expect.objectContaining({user_id:a}));
    const read=await get("history","bob");expect(read.status).toBe(200);expect(db.get).toHaveBeenCalledWith("recall_events",expect.objectContaining({filters:{user_id:`eq.${b}`}}));
  });
  it("rejects a mismatched owner from the privileged query",async()=>{
    db.get.mockResolvedValueOnce([{id:"synthetic",user_id:b,brain_id:null,topic_id:null,quality:4,sm2_state_after:{},recalled_at:"synthetic"}]);
    const response=await get("history","alice");expect(response.status).toBe(502);expect(JSON.stringify(await response.json())).not.toContain("synthetic");
  });
  it("rejects mismatched due rows without returning their details",async()=>{
    db.get.mockResolvedValueOnce([{id:"synthetic-secret",user_id:b,brain_id:null,topic_id:null,next_recall_at:"2025-01-01T00:00:00Z"}]);
    const response=await get("due","alice");expect(response.status).toBe(502);expect(JSON.stringify(await response.json())).not.toContain("synthetic-secret");
  });
  it("returns only the mapped user's allowed history fields",async()=>{
    db.get.mockResolvedValueOnce([{id:"event",user_id:a,brain_id:null,topic_id:"topic",quality:4,sm2_state_after:{repetition:1},next_recall_at:"2025-01-01",recalled_at:"2025-01-01",private_extra:"secret"}]);
    const response=await get("history?limit=1","alice");expect(response.status).toBe(200);
    expect(await response.json()).toEqual({history:[{id:"event",brainId:null,topicId:"topic",quality:4,sm2State:{repetition:1},nextRecallAt:"2025-01-01",recalledAt:"2025-01-01"}]});
    expect(db.get).toHaveBeenCalledWith("recall_events",expect.objectContaining({filters:{user_id:`eq.${a}`},limit:1}));
  });
  it("rejects out-of-range pagination and unrepresentable schedules",async()=>{
    expect((await get("due?limit=-1","alice")).status).toBe(400);
    expect((await post("alice",{quality:5,sm2StateBefore:{repetition:5,intervalDays:1e300,easeFactor:1e300}})).status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();expect(db.get).not.toHaveBeenCalled();
  });
});
