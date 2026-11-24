import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {PGlite} from "@electric-sql/pglite";
import {readFile} from "node:fs/promises";
const alice="00000000-0000-4000-8000-000000000001",bob="00000000-0000-4000-8000-000000000002";
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
    CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.topics(id text PRIMARY KEY);CREATE TABLE public.brains(id text PRIMARY KEY,is_public boolean NOT NULL);
    CREATE TABLE public.posts(id text PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,topic_id text NOT NULL REFERENCES public.topics(id),content text NOT NULL,brain_id text REFERENCES public.brains(id));
    INSERT INTO auth.users VALUES ('${alice}'),('${bob}');INSERT INTO public.topics VALUES ('topic');`);
  await db.exec(await readFile("supabase/proposals/0019_brain_post_visibility.sql","utf8"));
  await db.exec(await readFile("supabase/proposals/0022_post_retry_ticket.sql","utf8"));
},30000);
afterAll(async()=>{await db?.close();});
async function issue(uid:string){return (await db.query<{ticket:string}>("SELECT public.experimental_issue_post_ticket($1) AS ticket",[uid])).rows[0].ticket;}
async function create(uid:string,ticket:string,content="synthetic"){return (await db.query<{result:string}>("SELECT public.experimental_create_post_with_ticket($1,$2,'topic',$3,NULL) AS result",[uid,ticket,content])).rows[0].result;}
describe("review-only server issued post retry permits",()=>{
  it("uses a server-issued 30-day permit and recognizes a same-payload retry",async()=>{
    const ticket=await issue(alice);
    const ttl=(await db.query<{seconds:number}>("SELECT extract(epoch from (expires_at-issued_at))::int AS seconds FROM public.experimental_post_tickets WHERE ticket_id=$1",[ticket])).rows[0].seconds;
    expect(ttl).toBe(30*24*60*60);
    expect(await create(alice,ticket)).toBe("created");expect(await create(alice,ticket)).toBe("replayed");
    await expect(create(alice,ticket,"other")).rejects.toMatchObject({code:"23505"});
    await expect(create(bob,ticket)).rejects.toMatchObject({code:"23505"});
  });
  it("rejects expired or purged permits instead of recreating deleted content",async()=>{
    const ticket=await issue(alice);await create(alice,ticket);
    await db.query("DELETE FROM public.posts WHERE id=$1",[ticket]);
    await expect(create(alice,ticket)).rejects.toMatchObject({code:"23505"});
    await db.query("UPDATE public.experimental_post_tickets SET expires_at=now()-interval '1 second' WHERE ticket_id=$1",[ticket]);
    await expect(create(alice,ticket)).rejects.toMatchObject({code:"23505"});
    await db.query("DELETE FROM public.experimental_post_tickets WHERE ticket_id=$1",[ticket]);
    await expect(create(alice,ticket)).rejects.toMatchObject({code:"23505"});
    expect((await db.query("SELECT count(*)::int AS n FROM public.posts WHERE id=$1",[ticket])).rows).toEqual([{n:0}]);
  });
  it("rejects expired unused or unknown permits and leaves no post",async()=>{
    const ticket=await issue(bob);await db.query("UPDATE public.experimental_post_tickets SET expires_at=now()-interval '1 second' WHERE ticket_id=$1",[ticket]);
    await expect(create(bob,ticket)).rejects.toMatchObject({code:"23505"});
    await expect(create(bob,"10000000-0000-4000-8000-000000000001")).rejects.toMatchObject({code:"23505"});
    expect((await db.query("SELECT count(*)::int AS n FROM public.posts WHERE id=$1",[ticket])).rows).toEqual([{n:0}]);
  });
  it("erases account permits when a synthetic account is deleted",async()=>{
    await db.query("DELETE FROM auth.users WHERE id=$1",[alice]);
    expect((await db.query("SELECT count(*)::int AS n FROM public.experimental_post_tickets WHERE user_id=$1",[alice])).rows).toEqual([{n:0}]);
  });
});
