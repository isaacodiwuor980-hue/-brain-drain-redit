import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ get:vi.fn(), isConfigured:vi.fn(()=>true) }));
vi.mock("../lib/supabase",()=>({supabase:db,SupabaseError:class extends Error {status=500;body?:unknown;}}));
vi.mock("../middleware/auth",()=>({requireAuth(_req:express.Request,_res:express.Response,next:express.NextFunction){next();},optionalAuth(_req:express.Request,_res:express.Response,next:express.NextFunction){next();}}));
import router from "./feed";
let server:Server, base:string, publicBrain=true, lookupFails=false;
const post=(id:string,brain_id:string)=>({id,user_id:"synthetic-author",topic_id:"topic",content:"synthetic post",tags:[],post_type:"post",event:null,media_urls:[],brain_id,repost_count:0,created_at:"2025-01-01T00:00:00Z",comment_count:0,topic:null,author:null});
beforeAll(async()=>{const app=express();app.use("/api",router);await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});const addr=server.address();if(!addr||typeof addr==="string") throw new Error("no port");base=`http://127.0.0.1:${addr.port}`;});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));});
beforeEach(()=>{vi.clearAllMocks(); publicBrain=true;lookupFails=false;db.get.mockImplementation(async(table:string)=>{
  if(table==="posts") return [post("p1","synthetic-public"),post("p2","synthetic-private")];
  if(table==="reactions") return [];
  if(table==="brains") {if(lookupFails) throw new Error("private upstream details");return publicBrain?[{id:"synthetic-public",is_public:true}]:[];}
  throw new Error("unexpected table");
});});
async function get(topic:string){const res=await fetch(`${base}/api/feed?topic=${topic}`);return {res,body:await res.json()};}
describe("feed linked-brain privacy with mocked storage",()=>{
  it("exposes only explicitly public linked brain IDs, rechecking on each cached response",async()=>{
    const first=await get("visibility-a");
    expect(first.res.status).toBe(200); expect(first.res.headers.get("x-feed-cache")).toBe("MISS");
    expect(first.body.posts[0].brainId).toBe("synthetic-public");
    expect(first.body.posts[1].brainId).toBeNull();
    expect(JSON.stringify(first.body)).not.toContain("synthetic-private");
    publicBrain=false;
    const second=await get("visibility-a");
    expect(second.res.headers.get("x-feed-cache")).toBe("HIT");
    expect(second.body.posts.map((p:{brainId:string|null})=>p.brainId)).toEqual([null,null]);
  });
  it("does not trust malformed visibility metadata or unsafe IDs",async()=>{
    db.get.mockImplementation(async(table:string)=>{
      if(table==="posts") return [post("p1","synthetic-public"),post("p2","bad),injected")];
      if(table==="reactions") return [];
      if(table==="brains") return [{id:"synthetic-public",is_public:"true"},{id:"bad),injected",is_public:true}];
      throw new Error("unexpected table");
    });
    const {body}=await get("visibility-c");
    expect(body.posts.map((p:{brainId:string|null})=>p.brainId)).toEqual([null,null]);
    const query=db.get.mock.calls.find(c=>c[0]==="brains")?.[1];
    expect(JSON.stringify(query)).not.toContain("injected");
  });
  it("fails closed on brain lookup errors and does not return upstream details",async()=>{
    lookupFails=true; const {res,body}=await get("visibility-b");
    expect(res.status).toBe(200); expect(body.posts.map((p:{brainId:string|null})=>p.brainId)).toEqual([null,null]);
    expect(JSON.stringify(body)).not.toContain("private upstream details");
  });
  it("rejects malformed post IDs before building the reactions filter",async()=>{
    db.get.mockImplementation(async(table:string)=>{
      if(table==="posts") return [post('bad"),evil','synthetic-public')];
      if(table==="reactions") return [];
      if(table==="brains") return [];
      throw new Error("unexpected table");
    });
    const {res,body}=await get("bad-post-id-regression");
    expect(res.status).toBe(502);
    expect(body).toEqual({error:"Feed data source unavailable"});
    expect(db.get.mock.calls.some(call=>call[0]==="reactions")).toBe(false);
  });
});
