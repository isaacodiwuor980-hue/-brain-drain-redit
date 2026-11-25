import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
let db: PGlite;
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
async function asRole(role: string, uid: string, action: () => Promise<void>) {
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.test_uid', '${uid}', false)`);
  try { await action(); } finally { await db.exec("RESET ROLE"); }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.test_uid',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE TABLE public.personality_tests (id uuid PRIMARY KEY, user_id uuid NOT NULL, answers jsonb NOT NULL);
    GRANT ALL ON public.personality_tests TO anon, authenticated, service_role;
    CREATE POLICY "personality_tests read own" ON public.personality_tests FOR SELECT TO authenticated USING ((SELECT auth.uid() AS uid) = user_id);
    CREATE POLICY "personality_tests write own" ON public.personality_tests FOR ALL TO authenticated USING ((SELECT auth.uid() AS uid) = user_id) WITH CHECK ((SELECT auth.uid() AS uid) = user_id);
    INSERT INTO public.personality_tests VALUES ('${alice}', '${alice}', '{}'), ('${bob}', '${bob}', '{}');
  `);
  await db.exec(await readFile("supabase/live-reviewed/20261125230547_personality_tests_enable_rls.sql", "utf8"));
});
afterAll(async () => { await db.close(); });
describe("personality tests RLS migration on synthetic data", () => {
  it("preserves rows while isolating authenticated users", async () => {
    await asRole("authenticated", alice, async () => {
      expect((await db.query("SELECT user_id FROM personality_tests")).rows).toEqual([{user_id: alice}]);
      expect((await db.query("DELETE FROM personality_tests WHERE user_id=$1 RETURNING id", [bob])).rows).toHaveLength(0);
      await expect(db.query("INSERT INTO personality_tests VALUES ($1,$2,'{}')", ["00000000-0000-4000-8000-000000000003",bob])).rejects.toThrow();
      await expect(db.exec("TRUNCATE personality_tests")).rejects.toThrow();
    });
  });
  it("denies anonymous row access and truncate", async () => {
    await asRole("anon", "", async () => {
      expect((await db.query("SELECT * FROM personality_tests")).rows).toHaveLength(0);
      await expect(db.exec("TRUNCATE personality_tests")).rejects.toThrow();
    });
  });
  it("does not pretend to restrict the privileged service role", async () => {
    await asRole("service_role", "", async () => { expect((await db.query("SELECT * FROM personality_tests")).rows).toHaveLength(2); });
  });
});
