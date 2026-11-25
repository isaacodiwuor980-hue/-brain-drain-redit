import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const a = "00000000-0000-4000-8000-000000000001";
const operation = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.user_identity_map(firebase_subject text PRIMARY KEY,supabase_uid uuid NOT NULL UNIQUE REFERENCES auth.users(id));
    CREATE TABLE public.posts(id text PRIMARY KEY);
    CREATE TABLE public.reactions(target_type text NOT NULL,target_id text NOT NULL,user_id uuid NOT NULL,reaction_type text NOT NULL, UNIQUE(target_type,target_id,user_id,reaction_type));
    INSERT INTO auth.users VALUES ('${a}'); INSERT INTO public.user_identity_map VALUES ('alice','${a}'); INSERT INTO public.posts VALUES ('post-1');`);
  await db.exec(await readFile("supabase/proposals/0023_reaction_cas_experiment.sql", "utf8"));
  await db.exec(await readFile("supabase/proposals/0025_reaction_two_step_experiment.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
async function set(desired: string | null, version: number, n: number) {
  return (await db.query<{ result: { version: number; desired: string | null } }>(
    "SELECT public.experimental_set_vote_two_step('alice','post-1',$1,$2,$3) AS result", [desired, version, operation(n)],
  )).rows[0].result;
}
describe("two-step versioned votes, synthetic proposal only", () => {
  it("rejects direct switching in both directions, without changing revision or state", async () => {
    expect(await set("upvote", 0, 1)).toEqual({ version: 1, desired: "upvote" });
    await expect(set("downvote", 1, 2)).rejects.toMatchObject({ code: "23514" });
    expect(await set(null, 1, 3)).toEqual({ version: 2, desired: null });
    expect(await set("downvote", 2, 4)).toEqual({ version: 3, desired: "downvote" });
    await expect(set("upvote", 3, 5)).rejects.toMatchObject({ code: "23514" });
    expect((await db.query("SELECT reaction_type FROM public.reactions WHERE user_id=$1", [a])).rows).toEqual([{ reaction_type: "downvote" }]);
  });
  it("replays a completed earlier operation without overwriting the newer vote", async () => {
    expect(await set("upvote", 0, 1)).toEqual({ version: 1, desired: "upvote" });
    expect((await db.query("SELECT reaction_type FROM public.reactions WHERE user_id=$1", [a])).rows).toEqual([{ reaction_type: "downvote" }]);
    await expect(set(null, 2, 6)).rejects.toMatchObject({ code: "40001" });
  });
  it("rejects ambiguous legacy states instead of guessing which vote to remove", async () => {
    await db.query("INSERT INTO public.reactions VALUES ('post','post-1',$1,'upvote')", [a]);
    await expect(set(null, 3, 7)).rejects.toMatchObject({ code: "23514" });
    expect((await db.query("SELECT reaction_type FROM public.reactions WHERE user_id=$1 ORDER BY reaction_type", [a])).rows).toEqual([{ reaction_type: "downvote" }, { reaction_type: "upvote" }]);
  });
  it("demonstrates that the old privileged writer still bypasses the two-step boundary", async () => {
    const result = (await db.query<{result: {version: number; desired: string | null}}>(
      "SELECT public.experimental_set_vote_cas('alice','post-1','upvote',3,$1) AS result", [operation(8)],
    )).rows[0].result;
    expect(result).toEqual({version: 4, desired: "upvote"});
    expect((await db.query("SELECT reaction_type FROM public.reactions WHERE user_id=$1", [a])).rows).toEqual([{reaction_type: "upvote"}]);
  });
  it("denies untrusted roles execute access", async () => {
    const rows = (await db.query("SELECT has_function_privilege('authenticated','public.experimental_set_vote_two_step(text,text,text,bigint,uuid)','EXECUTE') AS allowed")).rows;
    expect(rows).toEqual([{ allowed: false }]);
  });
});
