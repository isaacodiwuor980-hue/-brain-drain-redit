import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {readFile} from "node:fs/promises";

const alice="00000000-0000-4000-8000-000000000001",bob="00000000-0000-4000-8000-000000000002";
const requestA="10000000-0000-4000-8000-000000000001",requestB="10000000-0000-4000-8000-000000000002";
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.topics(id text PRIMARY KEY);
    CREATE TABLE public.brains(id text PRIMARY KEY,is_public boolean NOT NULL);
    CREATE TABLE public.posts(id text PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),topic_id text NOT NULL REFERENCES public.topics(id),content text NOT NULL,brain_id text REFERENCES public.brains(id) ON DELETE SET NULL);
    INSERT INTO auth.users VALUES ('${alice}'),('${bob}');INSERT INTO public.topics VALUES ('topic');
    INSERT INTO public.brains VALUES ('public-brain',true),('private-brain',false);`);
  await db.exec(await readFile("supabase/proposals/0019_brain_post_visibility.sql","utf8"));
  await db.exec(await readFile("supabase/proposals/0020_post_idempotency_experiment.sql","utf8"));
},30000);
afterAll(async()=>{await db?.close();});
async function create(uid:string,key:string,id:string,content:string,brain:string|null=null){
  return (await db.query<{outcome:string}>("SELECT public.experimental_create_post_once($1,$2,$3,$4,$5,$6) AS outcome",[uid,key,id,"topic",content,brain])).rows[0].outcome;
}
describe("review-only atomic post retry prototype",()=>{
  it("recognizes an exact account-bound retry without a duplicate post",async()=>{
    expect(await create(alice,requestA,"post-a","synthetic-a","public-brain")).toBe("created");
    expect(await create(alice,requestA,"post-a","synthetic-a","public-brain")).toBe("replayed");
    expect((await db.query("SELECT count(*)::int AS n FROM public.posts WHERE id='post-a'")).rows).toEqual([{n:1}]);
  });
  it("rejects payload changes and another account using the same post id",async()=>{
    await expect(create(alice,requestA,"post-a","different","public-brain")).rejects.toMatchObject({code:"23505"});
    await expect(create(bob,requestB,"post-a","synthetic-a","public-brain")).rejects.toMatchObject({code:"23505"});
    expect((await db.query("SELECT count(*)::int AS n FROM public.experimental_post_requests WHERE user_id=$1",[bob])).rows).toEqual([{n:0}]);
  });
  it("rolls back the receipt if privacy guard rejects the post",async()=>{
    await expect(create(bob,requestB,"post-b","synthetic-b","private-brain")).rejects.toMatchObject({code:"23514"});
    expect((await db.query("SELECT count(*)::int AS n FROM public.experimental_post_requests WHERE user_id=$1",[bob])).rows).toEqual([{n:0}]);
    expect(await create(bob,requestB,"post-b","synthetic-b",null)).toBe("created");
  });
  it("does not restore a link detached after a privacy change on retry",async()=>{
    await db.exec("UPDATE public.brains SET is_public=false WHERE id='public-brain'");
    expect(await create(alice,requestA,"post-a","synthetic-a","public-brain")).toBe("replayed");
    expect((await db.query("SELECT brain_id FROM public.posts WHERE id='post-a'")).rows).toEqual([{brain_id:null}]);
  });
  it("documents the deletion resurrection blocker in this prototype",async()=>{
    const key="10000000-0000-4000-8000-000000000003";
    expect(await create(alice,key,"post-c","synthetic-c")).toBe("created");
    await db.exec("DELETE FROM public.posts WHERE id='post-c'");
    expect(await create(alice,key,"post-c","synthetic-c")).toBe("created");
    expect((await db.query("SELECT count(*)::int AS n FROM public.posts WHERE id='post-c'")).rows).toEqual([{n:1}]);
  });
  it("denies direct untrusted access",async()=>{
    const result=await db.query("SELECT has_table_privilege('authenticated','public.experimental_post_requests','SELECT') AS can_read, has_function_privilege('anon','public.experimental_create_post_once(uuid,uuid,text,text,text,text)','EXECUTE') AS can_call");
    expect(result.rows).toEqual([{can_read:false,can_call:false}]);
  });
});
