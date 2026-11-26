/**
 * Isolated synthetic-data test ONLY. This script refuses TCP, arbitrary socket
 * paths and any PostgreSQL data directory other than the dedicated local test
 * cluster. Start that cluster separately; never use Supabase or shared data.
 * Usage: node scripts/test/privacy-hardened-postgres-concurrency.mjs
 * Requires pg devDependency and the disposable cluster described in the plan.
 */
import pg from "pg";
import { randomBytes } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const socket = await realpath(path.join(root, ".cache/pg-local/socket"));
const dataDir = await realpath(path.join(root, ".cache/pg-local/data"));
const opts = { host: socket, port: 55439, user: process.env.USER, database: "postgres", application_name: "privacy_synthetic_admin" };
const admin = new pg.Client(opts);
await admin.connect();
const settings = await admin.query("SELECT current_setting('data_directory') AS dir, current_setting('listen_addresses') AS listen");
if (await realpath(settings.rows[0].dir) !== dataDir || settings.rows[0].listen !== "") {
  await admin.end(); throw new Error("Refusing to run outside the dedicated socket-only local test cluster");
}
const dbName = `privacy_test_${randomBytes(8).toString("hex")}`;
let pool;
try {
  for (const role of ["anon", "authenticated", "service_role"]) {
    const found = await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]);
    if (!found.rowCount) await admin.query(`CREATE ROLE ${role} NOLOGIN`);
  }
  await admin.query(`CREATE DATABASE ${dbName}`);
  pool = new pg.Pool({ ...opts, database: dbName, max: 60 });
  const uid = "00000000-0000-4000-8000-000000000001";
  await pool.query(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.topics(id text PRIMARY KEY);
    CREATE TABLE public.server_feature_flags(name text PRIMARY KEY, enabled boolean NOT NULL);
    INSERT INTO auth.users VALUES ('${uid}'); INSERT INTO public.topics VALUES ('synthetic');
    INSERT INTO public.server_feature_flags VALUES ('feed_interest_tracking_v2', true);`);
  await pool.query(await readFile("supabase/proposals/0013_feed_privacy.sql", "utf8"));
  await pool.query(await readFile("supabase/proposals/0016_feed_privacy_write_grants.sql", "utf8"));
  const grants = await pool.query("SELECT has_table_privilege('service_role','public.feed_interest_topics','INSERT') AS i, has_table_privilege('service_role','public.feed_personalization_preferences','UPDATE') AS u");
  assert.deepEqual(grants.rows, [{ i: false, u: false }]);
  const service = await pool.connect();
  try {
    await service.query("SET ROLE service_role");
    await assert.rejects(service.query("INSERT INTO public.feed_interest_topics(user_id,topic_id,score) VALUES ($1,'synthetic',0.5)", [uid]), e => e.code === "42501");
    await assert.rejects(service.query("UPDATE public.feed_personalization_preferences SET enabled=true WHERE user_id=$1", [uid]), e => e.code === "42501");
    await service.query("SELECT public.feed_set_personalization($1,true)", [uid]);
  } finally { await service.query("RESET ROLE"); service.release(); }
  await pool.query("SELECT public.feed_set_personalization($1,true)", [uid]);
  async function epoch() { return (await pool.query("SELECT public.feed_interest_epoch($1)::text AS epoch", [uid])).rows[0].epoch; }
  async function read() { return (await pool.query("SELECT * FROM public.feed_read_interests($1)", [uid])).rows; }
  async function write(generation) { return (await pool.query("SELECT public.feed_record_interest($1,'synthetic',0.5,$2) AS accepted", [uid, generation])).rows[0].accepted; }
  async function waitForBlocked(count) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const r = await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND application_name=$2 AND wait_event_type='Lock'", [dbName, "privacy_synthetic_worker"]);
      if (r.rows[0].n >= count) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Did not observe ${count} independent blocked workers`);
  }
  async function competing(lockSql, oldEpoch) {
    const locker = await pool.connect();
    const workers = await Promise.all(Array.from({ length: 50 }, () => pool.connect()));
    try {
      await Promise.all(workers.map(c => c.query("SET application_name='privacy_synthetic_worker'")));
      await locker.query("BEGIN");
      await locker.query(lockSql, [uid]);
      const results = workers.map(c => c.query("SELECT public.feed_record_interest($1,'synthetic',0.5,$2) AS accepted", [uid, oldEpoch]));
      // Attach handlers immediately so a failed worker cannot become an unhandled rejection.
      const all = Promise.all(results);
      await waitForBlocked(50);
      await locker.query("COMMIT");
      const rows = await all;
      assert.equal(rows.length, 50);
      assert.ok(rows.every(r => r.rows[0].accepted === false));
    } finally {
      await locker.query("ROLLBACK").catch(() => {});
      locker.release(); workers.forEach(c => c.release());
    }
  }
  const generation1 = await epoch(); assert.equal(await write(generation1), true);
  await competing("SELECT public.feed_set_personalization($1,false)", generation1);
  assert.deepEqual(await read(), []);
  await pool.query("SELECT public.feed_set_personalization($1,true)", [uid]);
  const generation2 = await epoch(); assert.notEqual(generation2, generation1);
  assert.equal(await write(generation2), true);
  await competing("SELECT public.feed_clear_interests($1)", generation2);
  assert.deepEqual(await read(), []);
  const generation3 = await epoch(); assert.notEqual(generation3, generation2);
  assert.equal(await write(generation3), true);
  // A pending switch-off update blocks cooperating writes until its commit.
  const locker = await pool.connect();
  const worker = await pool.connect();
  try {
    await worker.query("SET application_name='privacy_synthetic_worker'");
    await locker.query("BEGIN");
    await locker.query("UPDATE public.server_feature_flags SET enabled=false WHERE name='feed_interest_tracking_v2'");
    const pending = worker.query("SELECT public.feed_record_interest($1,'synthetic',0.5,$2) AS accepted", [uid, generation3]);
    await waitForBlocked(1); await locker.query("COMMIT");
    assert.equal((await pending).rows[0].accepted, false); assert.deepEqual(await read(), []);
    await assert.rejects(pool.query("SELECT public.feed_set_personalization($1,true)", [uid]), e => e.code === "42501");
    await pool.query("SELECT public.feed_clear_interests($1)", [uid]);
  } finally { await locker.query("ROLLBACK").catch(() => {}); locker.release(); worker.release(); }
  const role = await pool.connect();
  try {
    await role.query("SET ROLE authenticated");
    await assert.rejects(role.query("SELECT * FROM public.feed_interest_topics"), e => e.code === "42501");
    await assert.rejects(role.query("SELECT public.feed_set_personalization($1,false)", [uid]), e => e.code === "42501");
  } finally { await role.query("RESET ROLE"); role.release(); }
  console.log("PASS: isolated PostgreSQL 17 with 0016; direct service writes denied, 50 stale writers after opt-out, 50 after clear, flag lock and untrusted role denial");
} finally {
  if (pool) await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await admin.end();
}
