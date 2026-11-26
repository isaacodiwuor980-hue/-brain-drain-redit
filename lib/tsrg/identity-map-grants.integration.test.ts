import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

// Local synthetic roles and records only; not proof of live Supabase grants.
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.posts(id text PRIMARY KEY);
    CREATE TABLE public.reactions(id text PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${alice}'), ('${bob}');`);
  await db.exec(await readFile("supabase/migrations/0007_identity_reactions_flags.sql", "utf8"));
  await db.query("INSERT INTO public.user_identity_map(firebase_subject,supabase_uid) VALUES ('synthetic-alice',$1)", [alice]);
  const proposal = await readFile("supabase/proposals/0017_identity_map_service_grants.sql", "utf8");
  await db.exec(proposal); await db.exec(proposal);
}, 30000);
afterAll(async () => { await db?.close(); });

describe("identity mapping service privilege hardening proposal", () => {
  it("allows lookup but denies the API service creating, replacing or deleting identity links", async () => {
    await db.exec("SET ROLE service_role");
    try {
      expect((await db.query("SELECT supabase_uid FROM public.user_identity_map WHERE firebase_subject='synthetic-alice'")).rows).toEqual([{supabase_uid:alice}]);
      await expect(db.query("INSERT INTO public.user_identity_map(firebase_subject,supabase_uid) VALUES ('synthetic-bob',$1)",[bob])).rejects.toMatchObject({ code:"42501" });
      await expect(db.query("UPDATE public.user_identity_map SET supabase_uid=$1 WHERE firebase_subject='synthetic-alice'",[bob])).rejects.toMatchObject({ code:"42501" });
      await expect(db.query("DELETE FROM public.user_identity_map WHERE firebase_subject='synthetic-alice'")).rejects.toMatchObject({ code:"42501" });
    } finally { await db.exec("RESET ROLE"); }
  });
});
