import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import express from "express";
import type {Server} from "node:http";
const db=vi.hoisted(()=>({isConfigured:vi.fn(()=>true),getOne:vi.fn(),insert:vi.fn()}));
vi.mock("../lib/supabase",()=>({supabase:db,SupabaseError:class extends Error {status=500;body?:unknown;}}));
vi.mock("../middleware/auth",()=>({requireAuth(req:express.Request,_res:express.Response,next:express.NextFunction){req.auth={uid:"synthetic-user"};next();}}));
import router from "./posts";
import {SupabaseError} from "../lib/supabase";
let server:Server,base:string;
beforeAll(async()=>{const app=express();app.use(express.json());app.use("/api",router);await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});const addr=server.address();if(!addr||typeof addr==="string") throw new Error("no port");base=`http://127.0.0.1:${addr.port}`;});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));});
beforeEach(()=>{vi.resetAllMocks();db.isConfigured.mockReturnValue(true);db.insert.mockResolvedValue(undefined);});
async function send(brainId?:string){return fetch(`${base}/api/posts`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"synthetic-post",topicId:"synthetic-topic",content:"synthetic",...(brainId===undefined?{}:{brainId})})});}
describe("public post attachment safety (mocked storage)",()=>{
  it("rejects an unknown or nonpublic brain without writing",async()=>{
    db.getOne.mockResolvedValue(null); expect((await send("synthetic-private")).status).toBe(400); expect(db.insert).not.toHaveBeenCalled();
    db.getOne.mockResolvedValue({id:"synthetic-private",is_public:false}); expect((await send("synthetic-private")).status).toBe(400); expect(db.insert).not.toHaveBeenCalled();
  });
  it("allows only a matching explicitly public brain",async()=>{
    db.getOne.mockResolvedValue({id:"synthetic-public",is_public:true}); expect((await send("synthetic-public")).status).toBe(201);
    expect(db.getOne).toHaveBeenCalledWith("brains",expect.objectContaining({filters:{id:"eq.synthetic-public",is_public:"eq.true"}}));
    expect(db.insert).toHaveBeenCalledWith("posts",expect.objectContaining({brain_id:"synthetic-public"}));
  });
  it("fails closed on missing metadata and rejects unsafe filters",async()=>{
    db.getOne.mockRejectedValue(new Error("synthetic-upstream-secret")); const response=await send("synthetic-public"); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("synthetic-upstream-secret");expect(db.insert).not.toHaveBeenCalled();
    expect((await send("a),injected")).status).toBe(400); expect(db.getOne).toHaveBeenCalledTimes(1);
  });
  it("preserves creation without an attachment",async()=>{expect((await send()).status).toBe(201);expect(db.getOne).not.toHaveBeenCalled();expect(db.insert).toHaveBeenCalledWith("posts",expect.objectContaining({brain_id:null}));});
  it("does not claim success for an unverified database conflict",async()=>{
    const error=new SupabaseError("synthetic confidential upstream",409);error.status=409;
    db.insert.mockRejectedValueOnce(error);
    const response=await send();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({error:"Post conflict could not be verified"});
  });
});
