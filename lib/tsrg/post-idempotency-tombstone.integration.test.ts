import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {PGlite} from "@electric-sql/pglite";
import {readFile} from "node:fs/promises";
const alice="00000000-0000-4000-8000-000000000001",bob="00000000-0000-4000-8000-000000000002";
const key="10000000-0000-4000-8000-000000000001",other="10000000-0000-4000-8000-000000000002";
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE TABLE public.topics(id text PRIMARY KEY);
  CREATE TABLE public.brains(id text PRIMARY KEY,is_public boolean NOT NULL);
  CREATE TABLE public.posts(id text PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,topic_id text NOT NULL REFERENCES public.topics(id),content text NOT NULL,brain_id text REFERENCES public.brains(id) ON DELETE SET NULL);
  INSERT INTO auth.users VALUES ('${alice}'),('${bob}');INSERT INTO public.topics VALUES ('topic');INSERT INTO public.brains VALUES ('public-brain',true),('private-brain',false);`);
  await db.exec(await readFile("supabase/proposals/0019_brain_post_visibility.sql","utf8"));
  await db.exec(await readFile("supabase/proposals/0021_post_idempotency_tombstones.sql","utf8"));
},30000);
afterAll(async()=>{await db?.close();});
async function create(uid:string,request:string,id:string,content:string,brain:string|null=null){return (await db.query<{outcome:string}>("SELECT public.experimental_create_post_once_v2($1,$2,$3,$4,$5,$6) AS outcome",[uid,request,id,"topic",content,brain])).rows[0].outcome;}
describe("review-only deletion-aware post retry experiment",()=>{
  it("recognizes exact retries but not different payloads or other account conflicts",async()=>{
    expect(await create(alice,key,"post-a","synthetic-a","public-brain")).toBe("created");
    expect(await create(alice,key,"post-a","synthetic-a","public-brain")).toBe("replayed");
    await expect(create(alice,key,"post-a","modified","public-brain")).rejects.toMatchObject({code:"23505"});
    await expect(create(bob,other,"post-a","synthetic-a","public-brain")).rejects.toMatchObject({code:"23505"});
  });
  it("keeps a minimal tombstone after deletion and rejects retries without reviving the post",async()=>{
    await db.exec("DELETE FROM public.posts WHERE id='post-a'");
    expect((await db.query("SELECT deleted,fingerprint IS NULL AS fingerprint_erased FROM public.experimental_post_requests_v2 WHERE user_id=$1",[alice])).rows).toEqual([{deleted:true,fingerprint_erased:true}]);
    await expect(create(alice,key,"post-a","synthetic-a","public-brain")).rejects.toMatchObject({code:"23505"});
    await expect(create(alice,other,"post-a","synthetic-a","public-brain")).rejects.toMatchObject({code:"23505"});
    expect((await db.query("SELECT count(*)::int AS n FROM public.posts WHERE id='post-a'")).rows).toEqual([{n:0}]);
  });
  it("rolls back the reservation if a private attachment is rejected",async()=>{
    await expect(create(bob,other,"post-b","synthetic-b","private-brain")).rejects.toMatchObject({code:"23514"});
    expect((await db.query("SELECT count(*)::int AS n FROM public.experimental_post_requests_v2 WHERE user_id=$1",[bob])).rows).toEqual([{n:0}]);
    expect(await create(bob,other,"post-b","synthetic-b",null)).toBe("created");
  });
  it("erases the synthetic account's receipts on account deletion without affecting another account",async()=>{
    await db.query("DELETE FROM auth.users WHERE id=$1",[alice]);
    expect((await db.query("SELECT user_id FROM public.experimental_post_requests_v2")).rows).toEqual([{user_id:bob}]);
  });
  it("rejects anonymous receipt reads and calls",async()=>{
    expect((await db.query("SELECT has_table_privilege('anon','public.experimental_post_requests_v2','SELECT') AS can_read,has_function_privilege('authenticated','public.experimental_create_post_once_v2(uuid,uuid,text,text,text,text)','EXECUTE') AS can_call")).rows).toEqual([{can_read:false,can_call:false}]);
  });
});
