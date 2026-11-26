import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.brains(id text PRIMARY KEY,is_public boolean NOT NULL);
    CREATE TABLE public.posts(id text PRIMARY KEY,content text NOT NULL,brain_id text REFERENCES public.brains(id) ON DELETE SET NULL);
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.brains, public.posts TO service_role;`);
  await db.exec(await readFile("supabase/proposals/0019_brain_post_visibility.sql", "utf8"));
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec(`TRUNCATE public.posts,public.brains;
    INSERT INTO public.brains VALUES ('public-brain',true),('private-brain',false),('other-brain',true);
    INSERT INTO public.posts VALUES ('post-a','synthetic-a','public-brain'),('post-b','synthetic-b','public-brain'),('post-c','synthetic-c','other-brain');`);
});
describe("local brain visibility and public-post link safety",()=>{
  it("rejects direct insert and update linking a nonpublic or absent brain",async()=>{
    await db.exec("SET ROLE service_role");
    try {
      await expect(db.query("INSERT INTO public.posts VALUES ('post-d','synthetic','private-brain')")).rejects.toMatchObject({code:"23514"});
      await expect(db.query("UPDATE public.posts SET brain_id='private-brain' WHERE id='post-c'")).rejects.toMatchObject({code:"23514"});
      await expect(db.query("INSERT INTO public.posts VALUES ('post-e','synthetic','missing-brain')")).rejects.toMatchObject({code:"23514"});
    } finally {await db.exec("RESET ROLE");}
  });
  it("detaches all links when a brain is made private without deleting posts or affecting another brain",async()=>{
    await db.query("UPDATE public.brains SET is_public=false WHERE id='public-brain'");
    expect((await db.query("SELECT id,content,brain_id FROM public.posts ORDER BY id")).rows).toEqual([
      {id:"post-a",content:"synthetic-a",brain_id:null},{id:"post-b",content:"synthetic-b",brain_id:null},{id:"post-c",content:"synthetic-c",brain_id:"other-brain"},
    ]);
    await db.query("UPDATE public.brains SET is_public=true WHERE id='public-brain'");
    expect((await db.query("SELECT brain_id FROM public.posts WHERE id='post-a'")).rows).toEqual([{brain_id:null}]);
  });
  it("rolls back detachment with the enclosing transaction",async()=>{
    await db.exec("BEGIN; UPDATE public.brains SET is_public=false WHERE id='public-brain'; ROLLBACK;");
    expect((await db.query("SELECT brain_id FROM public.posts WHERE id='post-a'")).rows).toEqual([{brain_id:"public-brain"}]);
    expect((await db.query("SELECT is_public FROM public.brains WHERE id='public-brain'")).rows).toEqual([{is_public:true}]);
  });
});
