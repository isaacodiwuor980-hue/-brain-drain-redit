import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {PGlite} from "@electric-sql/pglite";
import {readFile} from "node:fs/promises";
let db:PGlite;
const uid="00000000-0000-4000-8000-000000000001",op="10000000-0000-4000-8000-000000000001";
beforeAll(async()=>{
  db=new PGlite();await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE TABLE public.user_identity_map(firebase_subject text PRIMARY KEY,supabase_uid uuid NOT NULL UNIQUE REFERENCES auth.users(id));
  CREATE TABLE public.posts(id text PRIMARY KEY);CREATE TABLE public.reactions(target_type text NOT NULL,target_id text NOT NULL,user_id uuid NOT NULL,reaction_type text NOT NULL,UNIQUE(target_type,target_id,user_id,reaction_type));
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.reactions TO service_role;
  CREATE FUNCTION public.synthetic_legacy_writer(p_uid uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ INSERT INTO public.reactions VALUES ('post','post',p_uid,'downvote') ON CONFLICT DO NOTHING $$;
  REVOKE ALL ON FUNCTION public.synthetic_legacy_writer(uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.synthetic_legacy_writer(uuid) TO service_role;
  INSERT INTO auth.users VALUES ('${uid}');INSERT INTO public.user_identity_map VALUES ('alice','${uid}');INSERT INTO public.posts VALUES ('post');`);
  await db.exec(await readFile("supabase/proposals/0023_reaction_cas_experiment.sql","utf8"));
},30000);
afterAll(async()=>{await db?.close();});
describe("synthetic reaction writer restrictions",()=>{
  it("demonstrates the existing direct-writer bypass",async()=>{
    await db.exec("SET ROLE service_role");
    try{await db.query("INSERT INTO public.reactions VALUES ('post','post',$1,'upvote')",[uid]);}
    finally{await db.exec("RESET ROLE");}
    expect((await db.query("SELECT count(*)::int AS n FROM public.experimental_vote_versions")).rows).toEqual([{n:0}]);
    await db.query("DELETE FROM public.reactions WHERE user_id=$1",[uid]);
  });
  it("revokes explicit direct writes while permitting the experimental function",async()=>{
    await db.exec(await readFile("supabase/proposals/0024_reaction_writer_grants.sql","utf8"));
    await db.exec("SET ROLE service_role");
    try{
      await expect(db.query("INSERT INTO public.reactions VALUES ('post','post',$1,'upvote')",[uid])).rejects.toMatchObject({code:"42501"});
      const result=await db.query("SELECT public.experimental_set_vote_cas('alice','post','upvote',0,$1) AS result",[op]);
      expect(result.rows).toEqual([{result:{version:1,desired:"upvote"}}]);
      await expect(db.query("UPDATE public.reactions SET reaction_type='downvote'")).rejects.toMatchObject({code:"42501"});
      await expect(db.query("DELETE FROM public.reactions")).rejects.toMatchObject({code:"42501"});
    }finally{await db.exec("RESET ROLE");}
  });
  it("shows that a privileged legacy function can still bypass the revision",async()=>{
    await db.exec("SET ROLE service_role");
    try{await db.query("SELECT public.synthetic_legacy_writer($1)",[uid]);}
    finally{await db.exec("RESET ROLE");}
    expect((await db.query("SELECT reaction_type FROM public.reactions WHERE user_id=$1 ORDER BY reaction_type",[uid])).rows).toEqual([{reaction_type:"downvote"},{reaction_type:"upvote"}]);
    expect((await db.query("SELECT revision::int FROM public.experimental_vote_versions WHERE user_id=$1",[uid])).rows).toEqual([{revision:1}]);
  });
});
