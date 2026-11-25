import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const carol = "00000000-0000-4000-8000-000000000003";
async function actAs(uid: string, fn: () => Promise<void>) {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.test_uid', '${uid}', false)`);
  try { await fn(); } finally { await db.exec("RESET ROLE"); }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.test_uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
    CREATE TABLE public.user_follows (follower_id text NOT NULL, followee_id text NOT NULL, PRIMARY KEY (follower_id, followee_id));
    ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_follows TO authenticated, service_role;
    CREATE POLICY "user_follows owner" ON public.user_follows FOR ALL TO authenticated
      USING (follower_id = auth.uid()::text OR followee_id = auth.uid()::text)
      WITH CHECK (follower_id = auth.uid()::text OR followee_id = auth.uid()::text);
    INSERT INTO public.user_follows VALUES ('${alice}', '${bob}');
  `);
  await db.exec(await readFile("supabase/proposals/0026_user_follows_policy_experiment.sql", "utf8"));
});
afterAll(async () => { await db.close(); });

describe("follow policy alternative in synthetic fixture", () => {
  it("preserves existing rows and permits both participants to read", async () => {
    for (const uid of [alice, bob]) await actAs(uid, async () => {
      expect((await db.query("SELECT * FROM user_follows")).rows).toHaveLength(1);
    });
    await actAs(carol, async () => { expect((await db.query("SELECT * FROM user_follows")).rows).toHaveLength(0); });
  });
  it("prevents the followee creating, changing or deleting the follower's relationships", async () => {
    await actAs(bob, async () => {
      await expect(db.query("INSERT INTO user_follows VALUES ($1,$2)", [carol,bob])).rejects.toThrow();
      expect((await db.query("DELETE FROM user_follows WHERE follower_id=$1 RETURNING *", [alice])).rows).toHaveLength(0);
      expect((await db.query("UPDATE user_follows SET followee_id=$1 WHERE follower_id=$2 RETURNING *", [carol,alice])).rows).toHaveLength(0);
    });
  });
  it("allows follower insert and delete while retaining existing data", async () => {
    await actAs(alice, async () => {
      await db.query("INSERT INTO user_follows VALUES ($1,$2)", [alice,carol]);
      expect((await db.query("DELETE FROM user_follows WHERE follower_id=$1 AND followee_id=$2 RETURNING *", [alice,carol])).rows).toHaveLength(1);
      expect((await db.query("SELECT * FROM user_follows")).rows).toHaveLength(1);
    });
  });
  it("does not constrain the bypass role", async () => {
    await db.exec("SET ROLE service_role");
    try { await db.query("INSERT INTO user_follows VALUES ($1,$2)", [carol,bob]); }
    finally { await db.exec("RESET ROLE"); }
  });
});
