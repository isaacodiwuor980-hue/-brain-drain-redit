import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// Synthetic reproduction of selected observed policy and grants, not a live test.
let db: PGlite;
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const carol = "00000000-0000-4000-8000-000000000003";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.test_uid', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
    CREATE TABLE public.user_follows (follower_id text NOT NULL, followee_id text NOT NULL, PRIMARY KEY (follower_id, followee_id));
    ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_follows TO authenticated, service_role;
    CREATE POLICY "user_follows owner" ON public.user_follows FOR ALL TO authenticated
      USING (follower_id = auth.uid()::text OR followee_id = auth.uid()::text)
      WITH CHECK (follower_id = auth.uid()::text OR followee_id = auth.uid()::text);
  `);
});
afterAll(async () => { await db.close(); });

describe("observed text-follow policy in an isolated synthetic fixture", () => {
  it("allows a followee to create and delete another principal's relationship", async () => {
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.test_uid', '${bob}', false)`);
    try {
      await db.query("INSERT INTO user_follows VALUES ($1, $2)", [alice, bob]);
      const deleted = await db.query("DELETE FROM user_follows WHERE follower_id=$1 AND followee_id=$2 RETURNING follower_id", [alice, bob]);
      expect(deleted.rows).toHaveLength(1);
      await expect(db.query("INSERT INTO user_follows VALUES ($1, $2)", [alice, carol])).rejects.toThrow();
    } finally { await db.exec("RESET ROLE"); }
  });
  it("allows service role to write without either endpoint matching", async () => {
    await db.exec(`SET ROLE service_role; SELECT set_config('request.test_uid', '${bob}', false)`);
    try {
      await db.query("INSERT INTO user_follows VALUES ($1, $2)", [alice, carol]);
      const rows = await db.query("SELECT follower_id FROM user_follows WHERE follower_id=$1 AND followee_id=$2", [alice, carol]);
      expect(rows.rows).toHaveLength(1);
    } finally { await db.exec("RESET ROLE"); }
  });
});
