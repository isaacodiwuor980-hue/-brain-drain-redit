import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import express from "express";
import type { Server } from "node:http";

// Fake authentication and a deliberately narrow PostgREST adapter backed by a
// disposable PGlite database. This does not emulate Firebase, PostgREST, real
// Supabase roles, concurrent sessions, browser caching, or production identity.
const fixture=vi.hoisted(()=>({getOne:vi.fn(),rpc:vi.fn(),isConfigured:vi.fn(()=>true)}));
vi.mock("../lib/supabase",()=>({supabase:fixture}));
vi.mock("../middleware/auth",()=>({requireAuth(req:express.Request,res:express.Response,next:express.NextFunction){
  const token=req.headers.authorization;
  if(token!=="Bearer synthetic-alice" && token!=="Bearer synthetic-bob") {res.status(401).json({error:"Authentication required"});return;}
  req.auth={uid:token=== "Bearer synthetic-alice"?"alice":"bob"};next();
}}));
import router from "./feed-privacy";
const alice="00000000-0000-4000-8000-000000000001",bob="00000000-0000-4000-8000-000000000002";
let db:PGlite, server:Server, base:string;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.topics(id text PRIMARY KEY);
    CREATE TABLE public.server_feature_flags(name text PRIMARY KEY,enabled boolean NOT NULL);
    INSERT INTO auth.users VALUES ('${alice}'),('${bob}'); INSERT INTO public.topics VALUES ('art');
    INSERT INTO public.server_feature_flags VALUES ('feed_interest_tracking_v2',true);`);
  await db.exec(await readFile("supabase/proposals/0013_feed_privacy.sql","utf8"));
  await db.exec(await readFile("supabase/proposals/0016_feed_privacy_write_grants.sql","utf8"));
  fixture.getOne.mockImplementation(async(table:string,options:{filters:Record<string,string>})=>{
    if(table==="user_identity_map") {
      if(options.filters.firebase_subject==="eq.alice") return {supabase_uid:alice};
      if(options.filters.firebase_subject==="eq.bob") return {supabase_uid:bob};
      return null;
    }
    if(table==="server_feature_flags") return (await db.query("SELECT enabled FROM public.server_feature_flags WHERE name=$1",[options.filters.name.slice(3)])).rows[0]??null;
    if(table==="feed_personalization_preferences") return (await db.query("SELECT enabled FROM public.feed_personalization_preferences WHERE user_id=$1",[options.filters.user_id.slice(3)])).rows[0]??null;
    throw new Error("Unexpected test table");
  });
  fixture.rpc.mockImplementation(async(name:string,args:{p_uid:string;p_enabled?:boolean})=>{
    if(name==="feed_set_personalization") {await db.query("SELECT public.feed_set_personalization($1,$2)",[args.p_uid,args.p_enabled]);return;}
    if(name==="feed_clear_interests") {await db.query("SELECT public.feed_clear_interests($1)",[args.p_uid]);return;}
    throw new Error("Unexpected test RPC");
  });
  const app=express();app.use(express.json());app.use("/api",router);
  await new Promise<void>(resolve=>{server=app.listen(0,"127.0.0.1",resolve);});
  const addr=server.address();if(!addr||typeof addr==="string") throw new Error("No port");base=`http://127.0.0.1:${addr.port}`;
},30000);
afterAll(async()=>{if(server) await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));await db?.close();});
async function request(method:string,user:"alice"|"bob",body?:unknown){
  const res=await fetch(`${base}/api/feed-privacy`,{method,headers:{authorization:`Bearer synthetic-${user}`,...(body===undefined?{}:{"content-type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:res.status,cache:res.headers.get("cache-control"),body:res.status===204?null:await res.json()};
}
describe("synthetic account preference across simulated devices",()=>{
  it("reflects confirmed changes on another device, isolates accounts, and invalidates stale interests on opt-out",async()=>{
    expect((await request("GET","alice")).body.enabled).toBe(false);
    expect((await request("PUT","alice",{enabled:true})).status).toBe(204);
    const deviceB=await request("GET","alice");
    expect(deviceB.body).toEqual({enabled:true,scope:"proposed-feed-interests-only"});expect(deviceB.cache).toBe("no-store");
    expect((await request("GET","bob")).body.enabled).toBe(false);
    await request("PUT","bob",{enabled:true});
    const old=(await db.query<{epoch:string}>("SELECT public.feed_interest_epoch($1)::text AS epoch",[alice])).rows[0].epoch;
    await db.query("SELECT public.feed_record_interest($1,'art',0.8,$2)",[alice,old]);
    await db.query("SELECT public.feed_record_interest($1,'art',0.9,public.feed_interest_epoch($1))",[bob]);
    expect((await request("PUT","alice",{enabled:false})).status).toBe(204);
    expect((await request("GET","alice")).body.enabled).toBe(false);
    expect((await request("GET","bob")).body.enabled).toBe(true);
    expect((await db.query("SELECT public.feed_record_interest($1,'art',0.8,$2) AS accepted",[alice,old])).rows).toEqual([{accepted:false}]);
    expect((await db.query("SELECT user_id FROM public.feed_interest_topics")).rows).toEqual([{user_id:bob}]);
  });
});
