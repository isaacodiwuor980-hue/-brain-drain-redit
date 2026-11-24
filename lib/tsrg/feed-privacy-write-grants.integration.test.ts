import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

// Synthetic PGlite only; this does not test production Supabase grants/RLS.
const uid = "00000000-0000-4000-8000-000000000001";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.topics(id text PRIMARY KEY);
    CREATE TABLE public.server_feature_flags(name text PRIMARY KEY, enabled boolean NOT NULL);
    INSERT INTO public.server_feature_flags VALUES ('feed_interest_tracking_v2', true);
    INSERT INTO auth.users VALUES ('${uid}'); INSERT INTO public.topics VALUES ('art');`);
  await db.exec(await readFile("supabase/proposals/0013_feed_privacy.sql", "utf8"));
  await db.exec(await readFile("supabase/proposals/0016_feed_privacy_write_grants.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

describe("local interest privacy write grants", () => {
  it("denies service role direct mutation while preserving reads and reviewed function access", async () => {
    for (const table of ["feed_personalization_preferences", "feed_interest_topics"]) {
      const rights = await db.query("SELECT has_table_privilege('service_role',$1,'SELECT') AS can_read, has_table_privilege('service_role',$1,'INSERT') AS can_insert, has_table_privilege('service_role',$1,'UPDATE') AS can_update, has_table_privilege('service_role',$1,'DELETE') AS can_delete", [`public.${table}`]);
      expect(rights.rows).toEqual([{ can_read: true, can_insert: false, can_update: false, can_delete: false }]);
    }
    expect((await db.query("SELECT has_function_privilege('service_role','public.feed_record_interest(uuid,text,numeric,bigint)','EXECUTE') AS allowed")).rows).toEqual([{ allowed: true }]);
  });
  it("prevents bypassing opt-out with direct writes while allowing the locked privacy RPCs", async () => {
    await db.exec("SET ROLE service_role");
    try {
      await db.query("SELECT public.feed_set_personalization($1,true)", [uid]);
      const oldEpoch = (await db.query<{ epoch: string }>("SELECT public.feed_interest_epoch($1)::text AS epoch", [uid])).rows[0].epoch;
      expect((await db.query("SELECT public.feed_record_interest($1,'art',0.5,$2) AS accepted", [uid, oldEpoch])).rows).toEqual([{ accepted: true }]);
      await db.query("SELECT public.feed_set_personalization($1,false)", [uid]);
      expect((await db.query("SELECT public.feed_record_interest($1,'art',0.5,$2) AS accepted", [uid, oldEpoch])).rows).toEqual([{ accepted: false }]);
      await expect(db.query("INSERT INTO public.feed_interest_topics(user_id,topic_id,score) VALUES ($1,'art',0.9)", [uid])).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("UPDATE public.feed_personalization_preferences SET enabled=true WHERE user_id=$1", [uid])).rejects.toMatchObject({ code: "42501" });
    } finally { await db.exec("RESET ROLE"); }
    expect((await db.query("SELECT count(*)::int AS n FROM public.feed_interest_topics WHERE user_id=$1", [uid])).rows).toEqual([{ n: 0 }]);
  });
});
