import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
let db: PGlite;
const alice = "00000000-0000-4000-8000-000000000001", bob = "00000000-0000-4000-8000-000000000002";
const req1 = "10000000-0000-4000-8000-000000000001", req2 = "10000000-0000-4000-8000-000000000002", req3 = "10000000-0000-4000-8000-000000000003";
const stake1 = "20000000-0000-4000-8000-000000000001", stake2 = "20000000-0000-4000-8000-000000000002";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.posts(id text PRIMARY KEY); INSERT INTO auth.users VALUES ('${alice}'), ('${bob}');
    INSERT INTO public.posts VALUES ('post-1'),('post-2');`);
  await db.exec(await readFile("supabase/proposals/0014_points_ledger.sql", "utf8"));
}, 30000);
beforeEach(async () => { await db.exec("TRUNCATE public.feed_points_ledger, public.feed_points_requests, public.feed_point_stakes, public.feed_point_wallets"); });
afterAll(async () => { await db?.close(); });
async function open(uid: string) { return (await db.query<{value: unknown}>("SELECT public.feed_open_points_wallet($1) AS value",[uid])).rows[0].value; }
async function reserve(uid: string, req: string, stake: string, post: string, amount: number) { return (await db.query<{value: unknown}>("SELECT public.feed_reserve_points($1,$2,$3,$4,$5) AS value",[uid,req,stake,post,amount])).rows[0].value; }
async function release(uid: string, req: string, stake: string) { return (await db.query<{value: unknown}>("SELECT public.feed_release_points($1,$2,$3) AS value",[uid,req,stake])).rows[0].value; }
async function balance(uid: string) { return (await db.query("SELECT available,reserved FROM public.feed_point_wallets WHERE user_id=$1",[uid])).rows; }
describe("local-only noncash points ledger proposal", () => {
  it("initializes exactly 1000 points once per account", async () => {
    await open(alice); await open(alice); await open(bob);
    expect(await balance(alice)).toEqual([{available:1000,reserved:0}]);
    expect((await db.query("SELECT kind,count(*)::int AS n FROM public.feed_points_ledger GROUP BY kind")).rows).toEqual([{kind:"initial",n:2}]);
  });
  it("reserves and releases without creating or destroying points", async () => {
    await open(alice); await reserve(alice,req1,stake1,"post-1",250); expect(await balance(alice)).toEqual([{available:750,reserved:250}]);
    await release(alice,req2,stake1); expect(await balance(alice)).toEqual([{available:1000,reserved:0}]);
    const sums = await db.query("SELECT sum(available_delta)::int AS a,sum(reserved_delta)::int AS r FROM public.feed_points_ledger WHERE user_id=$1",[alice]);
    expect(sums.rows).toEqual([{a:1000,r:0}]);
  });
  it("replays identical requests and rejects reused keys with different payloads", async () => {
    await open(alice); const original=await reserve(alice,req1,stake1,"post-1",200);
    expect(await reserve(alice,req1,stake1,"post-1",200)).toEqual(original);
    await expect(reserve(alice,req1,stake1,"post-1",201)).rejects.toMatchObject({code:"22023"});
    await expect(release(alice,req1,stake1)).rejects.toMatchObject({code:"22023"});
    const result=await release(alice,req2,stake1); expect(await release(alice,req2,stake1)).toEqual(result);
    expect((await db.query("SELECT count(*)::int AS n FROM public.feed_points_ledger WHERE user_id=$1",[alice])).rows).toEqual([{n:3}]);
  });
  it("prevents overspending, double stakes on a post, and cross-account release", async () => {
    await open(alice); await open(bob); await reserve(alice,req1,stake1,"post-1",900);
    await expect(reserve(alice,req2,stake2,"post-2",101)).rejects.toMatchObject({code:"23514"});
    await expect(reserve(alice,req2,stake2,"post-1",1)).rejects.toMatchObject({code:"23505"});
    await expect(release(bob,req3,stake1)).rejects.toMatchObject({code:"P0002"});
    expect(await balance(alice)).toEqual([{available:100,reserved:900}]); expect(await balance(bob)).toEqual([{available:1000,reserved:0}]);
  });
  it("rejects invalid and missing inputs with no partial mutation", async () => {
    await open(alice); for (const amount of [0,-1,1001]) await expect(reserve(alice,req1,stake1,"post-1",amount)).rejects.toMatchObject({code:"22023"});
    await expect(reserve(alice,req1,stake1,"unknown",1)).rejects.toMatchObject({code:"23503"});
    expect(await balance(alice)).toEqual([{available:1000,reserved:0}]);
  });
  it("makes ledger entries append-only and denies direct access to untrusted roles", async () => {
    await open(alice);
    await expect(db.query("UPDATE public.feed_points_ledger SET available_delta=2")).rejects.toMatchObject({code:"55000"});
    await expect(db.query("DELETE FROM public.feed_points_ledger")).rejects.toMatchObject({code:"55000"});
    const rights=await db.query("SELECT has_table_privilege('authenticated','public.feed_point_wallets','SELECT') AS wallet, has_function_privilege('anon','public.feed_reserve_points(uuid,uuid,uuid,text,integer)','EXECUTE') AS reserve, has_function_privilege('service_role','public.feed_reserve_points(uuid,uuid,uuid,text,integer)','EXECUTE') AS service");
    expect(rights.rows).toEqual([{wallet:false,reserve:false,service:true}]);
  });
});
