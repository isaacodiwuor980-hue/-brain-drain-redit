import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
let db: PGlite;
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const reviewer = "00000000-0000-4000-8000-000000000003";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.topics(id text PRIMARY KEY);
    CREATE TABLE public.posts(id text PRIMARY KEY, topic_id text REFERENCES public.topics(id));
    CREATE TABLE public.reactions(id text PRIMARY KEY);
    CREATE TABLE public.user_identity_map(firebase_subject text PRIMARY KEY, supabase_uid uuid NOT NULL UNIQUE REFERENCES auth.users(id));
    INSERT INTO auth.users VALUES ('${alice}'), ('${bob}'), ('${reviewer}');
    INSERT INTO public.topics VALUES ('coding'), ('gaming');
    INSERT INTO public.posts VALUES ('coding-post','coding'), ('gaming-post','gaming');
    INSERT INTO public.reactions VALUES ('legacy');
    INSERT INTO public.user_identity_map VALUES ('alice','${alice}'), ('bob','${bob}');`);
  const migration = await readFile("supabase/migrations/0011_tiered_vote_foundation.sql", "utf8");
  await db.exec(migration); await db.exec(migration);
}, 30000);
beforeEach(async () => {
  await db.exec("DELETE FROM public.tiered_post_votes; DELETE FROM public.topic_authority_grants;");
  await db.query("INSERT INTO public.topic_authority_grants(user_id,topic_id,authority_score,reviewer_id,evidence_reference) VALUES ($1,$2,$3,$4,$5)", [alice, "coding", 0.8, reviewer, "review-1"]);
});
afterAll(async () => { await db?.close(); });
async function set(subject: string, post: string, direction: string | null, tier: string | null) {
  return (await db.query<{ result: unknown }>("SELECT public.set_tiered_post_vote($1,$2,$3,$4) AS result", [subject, post, direction, tier])).rows[0].result;
}
describe("isolated explicit tiered vote foundation", () => {
  it.each(["mouth", "lunch", "house", "life"])("stores explicit %s for the authorized topic", async (tier) => {
    expect(await set("alice", "coding-post", "upvote", tier)).toEqual({ postId: "coding-post", direction: "upvote", tier });
    const rows = await db.query("SELECT direction,tier,authority_score_snapshot::text FROM public.tiered_post_votes");
    expect(rows.rows).toEqual([{ direction: "upvote", tier, authority_score_snapshot: "0.8000" }]);
    expect((await db.query("SELECT * FROM public.reactions")).rows).toEqual([{ id: "legacy" }]);
  });
  it("changes or removes the single vote without affecting another account", async () => {
    await set("alice", "coding-post", "upvote", "life");
    await set("alice", "coding-post", "downvote", "house");
    expect((await db.query("SELECT direction,tier FROM public.tiered_post_votes")).rows).toEqual([{ direction: "downvote", tier: "house" }]);
    await set("bob", "coding-post", null, null); // no permission needed to remove one's own absent vote
    expect((await db.query("SELECT direction FROM public.tiered_post_votes")).rows).toEqual([{ direction: "downvote" }]);
    await set("alice", "coding-post", null, null);
    expect((await db.query("SELECT * FROM public.tiered_post_votes")).rows).toEqual([]);
  });
  // Deliberate behavior change: absence/revocation of a grant now uses the
  // requested baseline rather than denying an otherwise mapped voter.
  it("uses baseline for a new user and does not transfer authority across topics", async () => {
    await set("bob", "coding-post", "upvote", "life");
    await set("alice", "gaming-post", "upvote", "life");
    const rows = await db.query<{ user_id: string; authority_score_snapshot: string }>("SELECT user_id,authority_score_snapshot::text FROM public.tiered_post_votes ORDER BY user_id");
    expect(rows.rows).toEqual([{ user_id: alice, authority_score_snapshot: "0.1000" }, { user_id: bob, authority_score_snapshot: "0.1000" }]);
    // Life weight 4 multiplied by baseline trust 0.1 gives 0.4 points.
    expect(Number(rows.rows[0].authority_score_snapshot) * 4).toBeCloseTo(0.4);
    await expect(set("unknown", "coding-post", "upvote", "life")).rejects.toMatchObject({ code: "42501" });
  });
  it("uses baseline after a grant is revoked", async () => {
    await db.query("UPDATE public.topic_authority_grants SET revoked_at=now() WHERE user_id=$1", [alice]);
    await set("alice", "coding-post", "upvote", "life");
    expect((await db.query("SELECT authority_score_snapshot::text FROM public.tiered_post_votes")).rows).toEqual([{ authority_score_snapshot: "0.1000" }]);
  });
  it("enforces the minimum authority in stored grants", async () => {
    await expect(db.query("UPDATE public.topic_authority_grants SET authority_score=0.09 WHERE user_id=$1", [alice])).rejects.toMatchObject({ code: "23514" });
  });
  it("allows a user to remove their own vote after authority is revoked", async () => {
    await set("alice", "coding-post", "upvote", "life");
    await db.query("UPDATE public.topic_authority_grants SET revoked_at=now() WHERE user_id=$1", [alice]);
    await set("alice", "coding-post", null, null);
    expect((await db.query("SELECT * FROM public.tiered_post_votes")).rows).toEqual([]);
  });
  it("rejects invalid choices and missing posts without changing data", async () => {
    for (const [direction, tier] of [["upvote", "gold"], ["repost", "mouth"], [null, "mouth"], ["upvote", null]] as const) {
      await expect(set("alice", "coding-post", direction, tier)).rejects.toMatchObject({ code: "22023" });
    }
    await expect(set("alice", "missing", "upvote", "life")).rejects.toMatchObject({ code: "P0002" });
    expect((await db.query("SELECT * FROM public.tiered_post_votes")).rows).toEqual([]);
  });
  it("denies direct untrusted table access and function execution", async () => {
    const grants = await db.query(`SELECT has_table_privilege('anon','public.topic_authority_grants','SELECT') AS anon_read,
      has_table_privilege('authenticated','public.tiered_post_votes','INSERT') AS auth_write,
      has_function_privilege('authenticated','public.set_tiered_post_vote(text,text,text,text)','EXECUTE') AS auth_execute,
      has_function_privilege('service_role','public.set_tiered_post_vote(text,text,text,text)','EXECUTE') AS service_execute`);
    expect(grants.rows).toEqual([{ anon_read: false, auth_write: false, auth_execute: false, service_execute: true }]);
  });
});
