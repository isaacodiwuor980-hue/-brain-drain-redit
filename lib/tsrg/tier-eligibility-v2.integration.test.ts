import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
let db: PGlite;
const alice = "00000000-0000-4000-8000-000000000001";
const reviewer = "00000000-0000-4000-8000-000000000002";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.topics(id text PRIMARY KEY);
    CREATE TABLE public.posts(id text PRIMARY KEY, topic_id text REFERENCES public.topics(id));
    CREATE TABLE public.user_identity_map(firebase_subject text PRIMARY KEY, supabase_uid uuid UNIQUE NOT NULL REFERENCES auth.users(id));
    INSERT INTO auth.users VALUES ('${alice}'), ('${reviewer}');
    INSERT INTO public.topics VALUES ('science'), ('art');
    INSERT INTO public.posts VALUES ('post','science'),('artpost','art');
    INSERT INTO public.user_identity_map VALUES ('alice','${alice}');`);
  await db.exec(await readFile("supabase/migrations/0011_tiered_vote_foundation.sql", "utf8"));
  await db.exec(await readFile("supabase/proposals/0012_tier_eligibility_v2.sql", "utf8"));
}, 30000);
beforeEach(async () => { await db.exec("DELETE FROM public.tiered_post_votes; DELETE FROM public.topic_authority_grants;"); });
afterAll(async () => { await db?.close(); });
async function vote(subject: string, post: string, direction: string | null, tier: string | null) {
  return (await db.query<{ result: unknown }>("SELECT public.set_tiered_post_vote_v2($1,$2,$3,$4) AS result", [subject, post, direction, tier])).rows[0].result;
}
async function grant(score: number) {
  await db.query("INSERT INTO public.topic_authority_grants(user_id, topic_id, authority_score, reviewer_id, evidence_reference) VALUES ($1,'science',$2,$3,'review')", [alice, score, reviewer]);
}
describe("local tier eligibility v2 (not a points ledger)", () => {
  it("allows baseline Mouth, denies higher tiers, and leaves no partial writes", async () => {
    expect(await vote("alice", "post", "upvote", "mouth")).toEqual({ postId: "post", direction: "upvote", tier: "mouth" });
    for (const tier of ["lunch", "house", "life"]) await expect(vote("alice", "post", "downvote", tier)).rejects.toMatchObject({ code: "42501" });
    expect((await db.query("SELECT direction,tier FROM public.tiered_post_votes")).rows).toEqual([{ direction: "upvote", tier: "mouth" }]);
  });
  it.each([[0.3499,"lunch"], [0.35,"house"], [0.55,"life"]] as const)("rejects tier %s/%s above cap", async (score, tier) => {
    await grant(score); await expect(vote("alice", "post", "upvote", tier)).rejects.toMatchObject({ code: "42501" });
  });
  it.each([[0.35,"lunch"], [0.55,"house"], [0.75,"life"]] as const)("allows tier at threshold %s/%s", async (score, tier) => {
    await grant(score); expect(await vote("alice", "post", "upvote", tier)).toMatchObject({ tier });
  });
  it("does not transfer grants across topics and permits removal after revocation", async () => {
    await grant(0.8); await vote("alice", "post", "upvote", "life");
    await expect(vote("alice", "artpost", "upvote", "life")).rejects.toMatchObject({ code: "42501" });
    await db.exec("UPDATE public.topic_authority_grants SET revoked_at=now()");
    expect(await vote("alice", "post", null, null)).toMatchObject({ tier: null });
  });
  it("rejects invalid inputs and unknown identity", async () => {
    await expect(vote("unknown", "post", "upvote", "mouth")).rejects.toMatchObject({ code: "42501" });
    await expect(vote("alice", "post", "upvote", "gold")).rejects.toMatchObject({ code: "22023" });
  });
  it("can remove and reapply the V2 function without deleting existing votes locally", async () => {
    await vote("alice", "post", "upvote", "mouth");
    await db.exec(await readFile("supabase/rollbacks/0012_tier_eligibility_v2.sql", "utf8"));
    expect((await db.query("SELECT tier FROM public.tiered_post_votes")).rows).toEqual([{ tier: "mouth" }]);
    expect((await db.query("SELECT to_regprocedure('public.set_tiered_post_vote_v2(text,text,text,text)') AS func")).rows).toEqual([{func:null}]);
    const migration = await readFile("supabase/proposals/0012_tier_eligibility_v2.sql", "utf8");
    await db.exec(migration); await db.exec(migration);
    expect(await vote("alice", "post", "downvote", "mouth")).toMatchObject({ direction: "downvote" });
  });
  it("leaves legacy function unchanged and denies direct execution to public roles", async () => {
    await db.query("SELECT public.set_tiered_post_vote($1,$2,$3,$4)", ["alice", "post", "upvote", "life"]);
    const result = await db.query("SELECT tier FROM public.tiered_post_votes");
    expect(result.rows).toEqual([{ tier: "life" }]);
    const perms = await db.query("SELECT has_function_privilege('anon','public.set_tiered_post_vote_v2(text,text,text,text)','EXECUTE') AS anon, has_function_privilege('authenticated','public.set_tiered_post_vote_v2(text,text,text,text)','EXECUTE') AS authenticated, has_function_privilege('service_role','public.set_tiered_post_vote_v2(text,text,text,text)','EXECUTE') AS service");
    expect(perms.rows).toEqual([{anon:false,authenticated:false,service:true}]);
  });
});
