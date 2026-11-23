// Synthetic test ONLY. Refuses TCP and arbitrary database clusters.
// The cluster must be disposable and exist at .cache/pg-local/data.
import pg from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root=process.cwd(), socket=await realpath(path.join(root,".cache/pg-local/socket")), data=await realpath(path.join(root,".cache/pg-local/data"));
const opts={host:socket,port:55439,user:process.env.USER,database:"postgres",application_name:"points_synthetic_admin"};
const admin=new pg.Client(opts); await admin.connect();
const info=await admin.query("SELECT current_setting('data_directory') AS dir,current_setting('listen_addresses') AS listen");
if (await realpath(info.rows[0].dir)!==data || info.rows[0].listen!=="") { await admin.end(); throw new Error("Refusing non-disposable or TCP-enabled database"); }
const dbName=`points_test_${randomBytes(8).toString("hex")}`;
let pool;
try {
  for (const role of ["anon","authenticated","service_role"]) if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[role])).rowCount) await admin.query(`CREATE ROLE ${role} NOLOGIN`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  pool=new pg.Pool({...opts,database:dbName,max:55});
  const a="00000000-0000-4000-8000-000000000001", b="00000000-0000-4000-8000-000000000002";
  await pool.query(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE public.posts(id text PRIMARY KEY); INSERT INTO auth.users VALUES ('${a}'),('${b}'); INSERT INTO public.posts SELECT 'post-'||i FROM generate_series(1,50) i;`);
  await pool.query(await readFile("supabase/proposals/0014_points_ledger.sql","utf8"));
  const opens=await Promise.all(Array.from({length:50},()=>pool.query("SELECT public.feed_open_points_wallet($1) AS result",[a])));
  assert.ok(opens.every(result=>result.rows[0].result.available===1000));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.feed_points_ledger WHERE user_id=$1 AND kind='initial'",[a])).rows[0].n,1);
  // Fifty simultaneous distinct requests compete for ten affordable stakes.
  const attempts=await Promise.allSettled(Array.from({length:50},(_,i)=>pool.query("SELECT public.feed_reserve_points($1,$2,$3,$4,100)",[a,randomUUID(),randomUUID(),`post-${i+1}`])));
  assert.equal(attempts.filter(r=>r.status==="fulfilled").length,10);
  assert.equal(attempts.filter(r=>r.status==="rejected" && r.reason.code==="23514").length,40);
  assert.deepEqual((await pool.query("SELECT available,reserved FROM public.feed_point_wallets WHERE user_id=$1",[a])).rows,[{available:0,reserved:1000}]);
  assert.deepEqual((await pool.query("SELECT sum(available_delta)::int AS available,sum(reserved_delta)::int AS reserved FROM public.feed_points_ledger WHERE user_id=$1",[a])).rows,[{available:0,reserved:1000}]);
  // Fifty repeated requests must result in exactly one reservation/release.
  await pool.query("SELECT public.feed_open_points_wallet($1)",[b]);
  const reserveId=randomUUID(), releaseId=randomUUID(), stake=randomUUID();
  const reserveResults=await Promise.all(Array.from({length:50},()=>pool.query("SELECT public.feed_reserve_points($1,$2,$3,'post-1',300) AS result",[b,reserveId,stake])));
  assert.ok(reserveResults.every(r=>r.rows[0].result.available===700));
  const releaseResults=await Promise.all(Array.from({length:50},()=>pool.query("SELECT public.feed_release_points($1,$2,$3) AS result",[b,releaseId,stake])));
  assert.ok(releaseResults.every(r=>r.rows[0].result.available===1000));
  assert.deepEqual((await pool.query("SELECT available,reserved FROM public.feed_point_wallets WHERE user_id=$1",[b])).rows,[{available:1000,reserved:0}]);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.feed_points_ledger WHERE user_id=$1",[b])).rows[0].n,3);
  console.log("PASS: isolated PostgreSQL 17; 50 concurrent opens, 50 competing reservations, 50 reserve retries and 50 release retries");
} finally {
  if (pool) await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await admin.end();
}
