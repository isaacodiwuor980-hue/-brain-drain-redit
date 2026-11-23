import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

// The current draft deliberately restricts deletion. This test documents that
// blocker; it does not approve retaining real user information indefinitely.
const uid = "00000000-0000-4000-8000-000000000001";
const request = "10000000-0000-4000-8000-000000000001";
const releaseRequest = "10000000-0000-4000-8000-000000000002";
const stake = "20000000-0000-4000-8000-000000000001";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.posts(id text PRIMARY KEY);`);
  await db.query("INSERT INTO auth.users VALUES ($1)", [uid]);
  await db.query("INSERT INTO public.posts VALUES ($1)", ["synthetic-post"]);
  await db.exec(await readFile("supabase/proposals/0014_points_ledger.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

describe("points draft deletion blocker, disposable database", () => {
  it("blocks deletion of an account with an opened wallet", async () => {
    await db.query("SELECT public.feed_open_points_wallet($1)", [uid]);
    await expect(db.query("DELETE FROM auth.users WHERE id=$1", [uid])).rejects.toMatchObject({ code: "23001" });
    expect((await db.query("SELECT available,reserved FROM public.feed_point_wallets WHERE user_id=$1", [uid])).rows).toEqual([{ available: 1000, reserved: 0 }]);
  });
  it("blocks post deletion even after releasing a reservation", async () => {
    await db.query("SELECT public.feed_reserve_points($1,$2,$3,$4,$5)", [uid, request, stake, "synthetic-post", 50]);
    await db.query("SELECT public.feed_release_points($1,$2,$3)", [uid, releaseRequest, stake]);
    await expect(db.query("DELETE FROM public.posts WHERE id=$1", ["synthetic-post"])).rejects.toMatchObject({ code: "23001" });
    expect((await db.query("SELECT available,reserved FROM public.feed_point_wallets WHERE user_id=$1", [uid])).rows).toEqual([{ available: 1000, reserved: 0 }]);
    expect((await db.query("SELECT state FROM public.feed_point_stakes WHERE stake_id=$1", [stake])).rows).toEqual([{ state: "released" }]);
  });
});
