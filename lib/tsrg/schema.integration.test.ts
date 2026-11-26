import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
let db: PGlite;
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.posts(id text PRIMARY KEY);
    CREATE TABLE public.reactions(id text PRIMARY KEY);
    INSERT INTO auth.users(id) VALUES ('${alice}'), ('${bob}');
    INSERT INTO public.posts(id) VALUES ('post-text-id');
    INSERT INTO public.reactions(id) VALUES ('legacy');`);
}, 30000);
afterAll(async () => { await db?.close(); });
describe("TSRG foundation migration", () => {
  it("applies twice without destroying legacy data or fabricating aggregates", async () => {
    const migration = await readFile("supabase/migrations/0006_tsrg_foundation.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    expect((await db.query("SELECT id, tier FROM public.reactions")).rows).toEqual([{ id: "legacy", tier: "mouth" }]);
    expect((await db.query("SELECT * FROM public.post_velocity_hourly")).rows).toEqual([]);
    expect((await db.query("SELECT * FROM public.user_cluster")).rows).toEqual([]);
    expect((await db.query("SELECT * FROM public.post_accuracy_label")).rows).toEqual([]);
  });
  it("accepts text post ids and enforces ownership references and canonical edges", async () => {
    await db.query("INSERT INTO public.post_velocity_hourly(post_id,hour_bucket,up_mass) VALUES ($1,now(),$2)", ["post-text-id", "4294967296"]);
    await db.query("INSERT INTO public.covote_edge(u1,u2) VALUES ($1,$2)", [alice, bob]);
    await expect(db.query("INSERT INTO public.covote_edge(u1,u2) VALUES ($1,$2)", [bob, alice])).rejects.toMatchObject({ code: "23514" });
    await expect(db.query("INSERT INTO public.post_flag_state(post_id) VALUES ($1)", ["missing"])).rejects.toMatchObject({ code: "23503" });
  });
  it("enables RLS and denies direct access to untrusted roles", async () => {
    const result = await db.query<{ rls: boolean; anon: boolean; auth: boolean; service: boolean }>(`SELECT c.relrowsecurity AS rls,
      has_table_privilege('anon','public.user_cohort_fingerprint','SELECT') AS anon,
      has_table_privilege('authenticated','public.user_cohort_fingerprint','SELECT') AS auth,
      has_table_privilege('service_role','public.user_cohort_fingerprint','SELECT') AS service
      FROM pg_class c WHERE c.oid='public.user_cohort_fingerprint'::regclass`);
    expect(result.rows[0]).toEqual({ rls: true, anon: false, auth: false, service: true });
  });
});
