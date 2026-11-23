import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
let db: PGlite;
const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.topics(id text PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${a}'), ('${b}'); INSERT INTO public.topics VALUES ('art'),('science');`);
  await db.exec(await readFile("supabase/proposals/0013_feed_privacy.sql", "utf8"));
}, 30000);
beforeEach(async () => { await db.exec("DELETE FROM public.feed_interest_topics; DELETE FROM public.feed_personalization_preferences;"); });
afterAll(async () => { await db?.close(); });
async function setEnabled(uid: string, enabled: boolean) { return db.query("SELECT public.feed_set_personalization($1,$2)", [uid, enabled]); }
async function write(uid: string, topic: string, score: number) { return (await db.query<{ accepted: boolean }>("SELECT public.feed_record_interest($1,$2,$3) AS accepted", [uid, topic, score])).rows[0].accepted; }
async function read(uid: string) { return (await db.query("SELECT topic_id,score::text FROM public.feed_read_interests($1) ORDER BY topic_id", [uid])).rows; }
describe("local privacy SQL proposal, service-only and not wired", () => {
  it("defaults to off and stores no interest until opted in", async () => {
    expect(await write(a, "art", 0.9)).toBe(false);
    expect(await read(a)).toEqual([]);
    expect((await db.query("SELECT count(*)::int AS n FROM public.feed_interest_topics")).rows).toEqual([{n:0}]);
  });
  it("reads and clears only the requested account", async () => {
    await setEnabled(a, true); await setEnabled(b, true);
    expect(await write(a, "art", 0.9)).toBe(true); expect(await write(b, "science", 0.7)).toBe(true);
    expect(await read(a)).toEqual([{topic_id:"art",score:"0.9000"}]);
    await setEnabled(a, false);
    expect(await read(a)).toEqual([]); expect(await write(a, "art", 0.8)).toBe(false);
    expect(await read(b)).toEqual([{topic_id:"science",score:"0.7000"}]);
    expect((await db.query("SELECT count(*)::int AS n FROM public.feed_interest_topics WHERE user_id=$1", [a])).rows).toEqual([{n:0}]);
  });
  it("does not return stale saved rows while the preference is off", async () => {
    await setEnabled(a, true); await write(a, "art", 0.7);
    // Simulate stale data created outside these cooperating functions.
    await db.query("UPDATE public.feed_personalization_preferences SET enabled=false WHERE user_id=$1", [a]);
    expect(await read(a)).toEqual([]);
    expect(await write(a, "science", 0.9)).toBe(false);
  });
  it("can clear saved interests without changing the on/off setting", async () => {
    await setEnabled(a, true); await write(a, "art", 0.7);
    await db.query("SELECT public.feed_clear_interests($1)", [a]);
    expect(await read(a)).toEqual([]); expect(await write(a, "science", 0.6)).toBe(true);
  });
  it("rejects malformed inputs and unknown topics without partial writes", async () => {
    await setEnabled(a, true);
    for (const score of [-1, 1.1]) await expect(write(a, "art", score)).rejects.toMatchObject({code:"22023"});
    await expect(write(a, "unknown", 0.5)).rejects.toMatchObject({code:"23503"});
    expect(await read(a)).toEqual([]);
  });
  it("denies direct table access and function execution to untrusted roles", async () => {
    const rights = await db.query(`SELECT has_table_privilege('authenticated','public.feed_interest_topics','SELECT') AS read,
      has_function_privilege('anon','public.feed_record_interest(uuid,text,numeric)','EXECUTE') AS anonymous,
      has_function_privilege('authenticated','public.feed_set_personalization(uuid,boolean)','EXECUTE') AS authenticated,
      has_function_privilege('service_role','public.feed_set_personalization(uuid,boolean)','EXECUTE') AS service`);
    expect(rights.rows).toEqual([{read:false,anonymous:false,authenticated:false,service:true}]);
  });
});
