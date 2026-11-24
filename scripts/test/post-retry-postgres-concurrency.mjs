// SYNTHETIC ONLY. Refuses TCP and a cluster other than the dedicated local fixture.
// Tests proposal 0021, not a production schema, restricted Supabase role or API.
import pg from "pg";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {readFile,realpath} from "node:fs/promises";
const socket=await realpath(".cache/pg-local/socket"), data=await realpath(".cache/pg-local/data");
const opts={host:socket,port:55439,user:process.env.USER,database:"postgres",application_name:"post_retry_admin"};
const admin=new pg.Client(opts);await admin.connect();
const settings=await admin.query("SELECT current_setting('data_directory') AS dir,current_setting('listen_addresses') AS listen");
if(await realpath(settings.rows[0].dir)!==data || settings.rows[0].listen!==""){await admin.end();throw new Error("Refusing non-disposable or TCP-enabled cluster");}
const name=`post_retry_${randomBytes(8).toString("hex")}`;
let pool;
try {
  for(const role of ["anon","authenticated","service_role"]) if(!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[role])).rowCount) await admin.query(`CREATE ROLE ${role} NOLOGIN`);
  await admin.query(`CREATE DATABASE ${name}`);
  pool=new pg.Pool({...opts,database:name,max:14});
  await pool.query(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.topics(id text PRIMARY KEY);CREATE TABLE public.brains(id text PRIMARY KEY,is_public boolean NOT NULL);
    CREATE TABLE public.posts(id text PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,topic_id text NOT NULL REFERENCES public.topics(id),content text NOT NULL,brain_id text REFERENCES public.brains(id));
    INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001');INSERT INTO public.topics VALUES ('synthetic');`);
  await pool.query(await readFile("supabase/proposals/0019_brain_post_visibility.sql","utf8"));
  await pool.query(await readFile("supabase/proposals/0021_post_idempotency_tombstones.sql","utf8"));
  const call=(client,key,post)=>client.query("SELECT public.experimental_create_post_once_v2($1,$2,$3,'synthetic','synthetic',NULL) AS outcome",["00000000-0000-4000-8000-000000000001",key,post]);
  async function waitBlocked(n){
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){
      const result=await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND application_name='post_retry_worker' AND wait_event_type='Lock'",[name]);
      if(result.rows[0].n>=n)return;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    throw new Error("Timed out waiting for test locks");
  }
  const locker=await pool.connect(),workers=await Promise.all(Array.from({length:10},()=>pool.connect()));
  try {
    await Promise.all(workers.map(c=>c.query("SET application_name='post_retry_worker'")));
    const key="10000000-0000-4000-8000-000000000001";
    await locker.query("BEGIN"); assert.equal((await call(locker,key,"post-a")).rows[0].outcome,"created");
    const pending=workers.map(c=>call(c,key,"post-a"));const settled=Promise.allSettled(pending);
    await waitBlocked(10);await locker.query("COMMIT");
    assert.ok((await settled).every(r=>r.status==="fulfilled"&&r.value.rows[0].outcome==="replayed"));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.posts WHERE id='post-a'")).rows[0].n,1);
    // Delete owns the receipt lock before stale retries start; after commit all reject.
    await locker.query("BEGIN");await locker.query("DELETE FROM public.posts WHERE id='post-a'");
    const deletedAttempts=workers.map(c=>call(c,key,"post-a"));const deletedSettled=Promise.allSettled(deletedAttempts);
    await waitBlocked(10);await locker.query("COMMIT");
    assert.ok((await deletedSettled).every(r=>r.status==="rejected"&&r.reason.code==="23505"));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.posts WHERE id='post-a'")).rows[0].n,0);
    // Retry has the receipt lock first; deletion waits and then tombstones.
    const key2="10000000-0000-4000-8000-000000000002";
    await call(pool,key2,"post-b");await locker.query("BEGIN");
    assert.equal((await call(locker,key2,"post-b")).rows[0].outcome,"replayed");
    const deletion=workers[0].query("DELETE FROM public.posts WHERE id='post-b'");
    await waitBlocked(1);await locker.query("COMMIT");await deletion;
    await assert.rejects(call(pool,key2,"post-b"),e=>e.code==="23505");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.posts WHERE id='post-b'")).rows[0].n,0);
    console.log("PASS: synthetic same-key retries, delete-first and retry-first schedules on local PostgreSQL");
  } finally {await locker.query("ROLLBACK").catch(()=>{});locker.release();workers.forEach(c=>c.release());}
} finally {if(pool)await pool.end();await admin.query(`DROP DATABASE IF EXISTS ${name}`);await admin.end();}
