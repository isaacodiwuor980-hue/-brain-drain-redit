import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {PGlite} from "@electric-sql/pglite";
import {readFile} from "node:fs/promises";
const a="00000000-0000-4000-8000-000000000001",b="00000000-0000-4000-8000-000000000002";
const op=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
    CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.user_identity_map(firebase_subject text PRIMARY KEY,supabase_uid uuid NOT NULL UNIQUE REFERENCES auth.users(id));
    CREATE TABLE public.posts(id text PRIMARY KEY);
    CREATE TABLE public.reactions(target_type text NOT NULL,target_id text NOT NULL,user_id uuid NOT NULL,reaction_type text NOT NULL,UNIQUE(target_type,target_id,user_id,reaction_type));
    INSERT INTO auth.users VALUES ('${a}'),('${b}');INSERT INTO public.user_identity_map VALUES ('alice','${a}'),('bob','${b}');INSERT INTO public.posts VALUES ('post-1');`);
  await db.exec(await readFile("supabase/proposals/0023_reaction_cas_experiment.sql","utf8"));
},30000);
afterAll(async()=>{await db?.close();});
async function set(subject:string,desired:string|null,version:number,operation:string){return (await db.query<{result:{version:number;desired:string|null}}>("SELECT public.experimental_set_vote_cas($1,'post-1',$2,$3,$4) AS result",[subject,desired,version,operation])).rows[0].result;}
async function current(uid:string){return (await db.query("SELECT reaction_type FROM public.reactions WHERE user_id=$1 AND target_id='post-1' ORDER BY reaction_type",[uid])).rows;}
describe("synthetic desired-state vote with version",()=>{
  it("replays the same operation exactly once without changing state",async()=>{
    expect(await set("alice","upvote",0,op(1))).toEqual({version:1,desired:"upvote"});
    expect(await set("alice","upvote",0,op(1))).toEqual({version:1,desired:"upvote"});
    expect(await current(a)).toEqual([{reaction_type:"upvote"}]);
  });
  it("rejects a stale offline action and a reused operation with changed intent",async()=>{
    expect(await set("alice","downvote",1,op(2))).toEqual({version:2,desired:"downvote"});
    await expect(set("alice","upvote",0,op(3))).rejects.toMatchObject({code:"40001"});
    await expect(set("alice","upvote",1,op(2))).rejects.toMatchObject({code:"23505"});
    expect(await current(a)).toEqual([{reaction_type:"downvote"}]);
  });
  it("allows clearing a vote, preserving another account and independent reposts",async()=>{
    await set("bob","upvote",0,op(4));
    await db.query("INSERT INTO public.reactions VALUES ('post','post-1',$1,'repost')",[a]);
    expect(await set("alice",null,2,op(5))).toEqual({version:3,desired:null});
    expect(await current(a)).toEqual([{reaction_type:"repost"}]);expect(await current(b)).toEqual([{reaction_type:"upvote"}]);
  });
  it("rejects unmapped identities and denies untrusted roles",async()=>{
    await expect(set("unknown","upvote",0,op(6))).rejects.toMatchObject({code:"42501"});
    expect((await db.query("SELECT has_function_privilege('authenticated','public.experimental_set_vote_cas(text,text,text,bigint,uuid)','EXECUTE') AS allowed")).rows).toEqual([{allowed:false}]);
  });
});
