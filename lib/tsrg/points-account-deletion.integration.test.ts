import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const alice = "00000000-0000-4000-8000-000000000001", bob = "00000000-0000-4000-8000-000000000002";
const request = "10000000-0000-4000-8000-000000000001", stake = "20000000-0000-4000-8000-000000000001";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE public.posts(id text PRIMARY KEY);`);
  await db.query("INSERT INTO auth.users VALUES ($1),($2)", [alice, bob]);
  await db.query("INSERT INTO public.posts VALUES ('synthetic-post')");
  await db.exec(await readFile("supabase/proposals/0014_points_ledger.sql", "utf8"));
  await db.exec(await readFile("supabase/proposals/0015_points_account_erasure.sql", "utf8"));
  for (const user of [alice, bob]) await db.query("SELECT public.feed_open_points_wallet($1)", [user]);
  await db.query("SELECT public.feed_reserve_points($1,$2,$3,'synthetic-post',50)", [alice, request, stake]);
}, 30000);
afterAll(async () => { await db?.close(); });

describe("local-only points account erasure proposal", () => {
  it("erases one account's points rows atomically and preserves the other account", async () => {
    await db.exec("BEGIN");
    await db.query("SELECT public.feed_erase_points_account($1)", [alice]);
    for (const table of ["feed_point_wallets", "feed_point_stakes", "feed_points_requests", "feed_points_ledger"]) {
      expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.${table} WHERE user_id=$1`, [alice])).rows[0].n).toBe(0);
    }
    expect((await db.query("SELECT available,reserved FROM public.feed_point_wallets WHERE user_id=$1", [bob])).rows).toEqual([{ available: 1000, reserved: 0 }]);
    await db.query("DELETE FROM auth.users WHERE id=$1", [alice]);
    await db.exec("COMMIT");
    expect((await db.query("SELECT id FROM auth.users WHERE id=$1", [bob])).rows).toHaveLength(1);
    await db.query("SELECT public.feed_erase_points_account($1)", [alice]);
  });
  it("restores points rows and the account if the enclosing deletion rolls back", async () => {
    await db.exec("BEGIN");
    await db.query("SELECT public.feed_erase_points_account($1)", [bob]);
    await db.query("DELETE FROM auth.users WHERE id=$1", [bob]);
    await db.exec("ROLLBACK");
    expect((await db.query("SELECT available,reserved FROM public.feed_point_wallets WHERE user_id=$1", [bob])).rows).toEqual([{ available: 1000, reserved: 0 }]);
    expect((await db.query("SELECT count(*)::int AS n FROM public.feed_points_ledger WHERE user_id=$1", [bob])).rows).toEqual([{ n: 1 }]);
    expect((await db.query("SELECT count(*)::int AS n FROM public.feed_points_erasure_guard")).rows).toEqual([{ n: 0 }]);
  });
  it("denies direct erasure access to untrusted roles and retains append-only protection", async () => {
    const rights = await db.query("SELECT has_function_privilege('authenticated','public.feed_erase_points_account(uuid)','execute') AS authenticated, has_function_privilege('anon','public.feed_erase_points_account(uuid)','execute') AS anon, has_function_privilege('service_role','public.feed_erase_points_account(uuid)','execute') AS service");
    expect(rights.rows).toEqual([{ authenticated: false, anon: false, service: true }]);
    await expect(db.query("DELETE FROM public.feed_points_ledger WHERE user_id=$1", [bob])).rejects.toMatchObject({ code: "55000" });
  });
});
