import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db=vi.hoisted(()=>({getOne:vi.fn(),insert:vi.fn(),update:vi.fn(),isConfigured:vi.fn(()=>true)}));
vi.mock("../lib/supabase",()=>({supabase:db,SupabaseError:class extends Error {status=500;}}));
vi.mock("../middleware/auth",()=>({requireAuth(req:express.Request,res:express.Response,next:express.NextFunction){const uid=req.header("x-synthetic-user");if(!uid){res.status(401).json({error:"Authentication required"});return;}req.auth={uid};next();}}));
import router from "./onboarding";
const a="00000000-0000-4000-8000-000000000001",b="00000000-0000-4000-8000-000000000002";
let server:Server,base:string;
beforeAll(async()=>{const app=express();app.use(express.json());app.use("/api",router);await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});const address=server.address();if(!address||typeof address==="string")throw new Error("No port");base=`http://127.0.0.1:${address.port}`;});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));});
beforeEach(()=>{vi.resetAllMocks();db.isConfigured.mockReturnValue(true);db.getOne.mockImplementation(async(table:string,opts:{filters:Record<string,string>})=>{if(table==="user_identity_map")return opts.filters.firebase_subject==="eq.alice"?{supabase_uid:a}:null;return null;});});
async function request(path:string,user:string,method="GET",body?:unknown){return fetch(`${base}/api/onboarding${path}`,{method,headers:{"x-synthetic-user":user,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});}
describe("onboarding identity and preservation (mocked auth/database)",()=>{
  it("does not allow UUID-shaped unmapped subjects to read private scratch",async()=>{const response=await request("",b);expect(response.status).toBe(403);expect(db.getOne.mock.calls.every(call=>call[0]==="user_identity_map")).toBe(true);});
  it("uses the mapped UUID and rejects a mismatched returned owner",async()=>{db.getOne.mockImplementation(async(table:string)=>table==="user_identity_map"?{supabase_uid:a}:{user_id:b,scratch:{secret:"synthetic private"}});const response=await request("","alice");expect(response.status).toBe(502);expect(response.headers.get("cache-control")).toBe("no-store");expect(JSON.stringify(await response.json())).not.toContain("synthetic private");});
  it("creates only the mapped user's initial row",async()=>{const response=await request("/start","alice","POST");expect(response.status).toBe(200);expect(db.insert).toHaveBeenCalledWith("onboarding",expect.objectContaining({user_id:a}));});
  it("does not overwrite scratch with a stale unversioned patch",async()=>{const response=await request("/step/interests","alice","PATCH",{scratch:{data:"synthetic"}});expect(response.status).toBe(503);expect(db.update).not.toHaveBeenCalled();expect(db.insert).not.toHaveBeenCalled();});
});
