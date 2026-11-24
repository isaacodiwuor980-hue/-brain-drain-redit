// SYNTHETIC ONLY: refuses TCP and non-dedicated .cache/pg-local/data clusters.
import pg from "pg";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
const socket=await realpath(".cache/pg-local/socket"), data=await realpath(".cache/pg-local/data");
const opts={host:socket,port:55439,user:process.env.USER,database:"postgres",application_name:"brain_privacy_test_admin"};
const admin=new pg.Client(opts); await admin.connect();
const settings=await admin.query("SELECT current_setting('data_directory') AS dir,current_setting('listen_addresses') AS listen");
if(await realpath(settings.rows[0].dir)!==data||settings.rows[0].listen!==""){await admin.end();throw new Error("Refusing non-disposable or TCP-enabled cluster");}
const name=`brain_privacy_${randomBytes(8).toString("hex")}`;
let pool;
try {
  for(const role of ["anon","authenticated","service_role"]) if(!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[role])).rowCount) await admin.query(`CREATE ROLE ${role} NOLOGIN`);
  await admin.query(`CREATE DATABASE ${name}`);
  pool=new pg.Pool({...opts,database:name,max:20});
  await pool.query(`CREATE TABLE public.brains(id text PRIMARY KEY,is_public boolean NOT NULL);
    CREATE TABLE public.posts(id text PRIMARY KEY,content text NOT NULL,brain_id text REFERENCES public.brains(id) ON DELETE SET NULL);
    INSERT INTO public.brains VALUES ('synthetic',true);`);
  await pool.query(await readFile("supabase/proposals/0019_brain_post_visibility.sql","utf8"));
  async function waitBlocked(n){
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){
      const r=await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND application_name='brain_privacy_worker' AND wait_event_type='Lock'",[name]);
      if(r.rows[0].n>=n) return;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    throw new Error(`Expected ${n} blocked workers`);
  }
  const locker=await pool.connect(), workers=await Promise.all(Array.from({length:10},()=>pool.connect()));
  try {
    await Promise.all(workers.map(c=>c.query("SET application_name='brain_privacy_worker'")));
    // Visibility change holds the brain lock; all concurrent new links wait,
    // then must fail once the private state commits.
    await locker.query("BEGIN");
    await locker.query("UPDATE public.brains SET is_public=false WHERE id='synthetic'");
    const pending=workers.map((c,i)=>c.query("INSERT INTO public.posts VALUES ($1,'synthetic','synthetic')",[`post-${i}`]));
    const outcomes=Promise.allSettled(pending);
    await waitBlocked(10); await locker.query("COMMIT");
    const result=await outcomes; assert.ok(result.every(r=>r.status==='rejected'&&r.reason.code==='23514'));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.posts")).rows[0].n,0);
    // Attachment holds its brain share lock until commit; the privacy update
    // waits, then detaches the committed link in its own transaction.
    await pool.query("UPDATE public.brains SET is_public=true WHERE id='synthetic'");
    await locker.query("BEGIN");
    await locker.query("INSERT INTO public.posts VALUES ('attached','synthetic','synthetic')");
    const privacy=workers[0].query("UPDATE public.brains SET is_public=false WHERE id='synthetic'");
    await waitBlocked(1); await locker.query("COMMIT"); await privacy;
    assert.deepEqual((await pool.query("SELECT brain_id FROM public.posts WHERE id='attached'")).rows,[{brain_id:null}]);
    console.log("PASS: isolated Postgres synthetic fixture; 10 blocked inserts reject after private commit, committed link detached after waiting privacy update");
  } finally {
    await locker.query("ROLLBACK").catch(()=>{}); locker.release(); workers.forEach(c=>c.release());
  }
} finally {
  if(pool) await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${name}`); await admin.end();
}
