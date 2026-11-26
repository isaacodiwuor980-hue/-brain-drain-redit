import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

// Synthetic and isolated: this does not verify actual Supabase grants or races.
const a="00000000-0000-4000-8000-000000000001", b="00000000-0000-4000-8000-000000000002";
const e1="10000000-0000-4000-8000-000000000001", e2="10000000-0000-4000-8000-000000000002";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${a}'),('${b}');`);
  await db.exec(await readFile("supabase/proposals/0018_account_analytics.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
async function set(uid: string, enabled: boolean) { await db.query("SELECT public.experimental_analytics_set($1,$2)",[uid,enabled]); }
async function epoch(uid: string) { return (await db.query<{n:string}>("SELECT public.experimental_analytics_epoch($1)::text AS n", [uid])).rows[0].n; }
async function record(uid: string, generation: string, eventId: string, kind: string) { return (await db.query<{accepted:boolean}>("SELECT public.experimental_analytics_record($1,$2,$3,$4) AS accepted",[uid,generation,eventId,kind])).rows[0].accepted; }

describe("review-only account analytics", () => {
  it("defaults off, deletes one account's records on opt-out, and rejects stale generations even after re-enabling", async () => {
    const initial = await epoch(a);
    expect(await record(a, initial, e1, "page_view")).toBe(false);
    await set(a,true); await set(b,true);
    const old = await epoch(a), other = await epoch(b);
    expect(await record(a,old,e1,"page_view")).toBe(true);
    expect(await record(b,other,e2,"page_view")).toBe(true);
    await set(a,false);
    expect((await db.query("SELECT user_id FROM public.experimental_account_events")).rows).toEqual([{user_id:b}]);
    await set(a,true);
    expect(await record(a,old,e1,"page_view")).toBe(false);
    expect(await record(a,await epoch(a),e1,"page_view")).toBe(true);
  });
  it("deduplicates exact retries but rejects event-ID conflicts and unapproved event kinds", async () => {
    const current=await epoch(a);
    expect(await record(a,current,e1,"page_view")).toBe(true);
    await expect(record(a,current,e1,"session_start")).rejects.toMatchObject({code:"23505"});
    await expect(record(a,current,e2,"synthetic-free-text")).rejects.toMatchObject({code:"22023"});
  });
  it("rolls back an opt-out and its deletions together if the enclosing transaction fails", async () => {
    await db.exec("BEGIN");
    await set(a,false);
    expect((await db.query("SELECT count(*)::int AS n FROM public.experimental_account_events WHERE user_id=$1",[a])).rows).toEqual([{n:0}]);
    await db.exec("ROLLBACK");
    expect((await db.query("SELECT count(*)::int AS n FROM public.experimental_account_events WHERE user_id=$1",[a])).rows).toEqual([{n:1}]);
  });
  it("erases account-scoped records when the synthetic auth account is deleted", async () => {
    await db.query("DELETE FROM auth.users WHERE id=$1",[a]);
    expect((await db.query("SELECT count(*)::int AS n FROM public.experimental_account_events WHERE user_id=$1",[a])).rows).toEqual([{n:0}]);
    expect((await db.query("SELECT count(*)::int AS n FROM public.experimental_account_events WHERE user_id=$1",[b])).rows).toEqual([{n:1}]);
  });
  it("denies direct service mutations and untrusted RPC execution", async () => {
    expect((await db.query("SELECT has_table_privilege('service_role','public.experimental_account_events','INSERT') AS can_insert, has_function_privilege('authenticated','public.experimental_analytics_record(uuid,bigint,uuid,text)','EXECUTE') AS user_execute")).rows).toEqual([{can_insert:false,user_execute:false}]);
    await db.exec("SET ROLE service_role");
    try { await expect(db.query("DELETE FROM public.experimental_account_events")).rejects.toMatchObject({code:"42501"}); }
    finally { await db.exec("RESET ROLE"); }
  });
});
