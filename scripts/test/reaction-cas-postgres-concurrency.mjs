// Synthetic-only concurrency fixture; local socket, no live Supabase or Firebase.
import pg from "pg";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {readFile,realpath} from "node:fs/promises";
const socket=await realpath(".cache/pg-local/socket"),data=await realpath(".cache/pg-local/data");
const opts={host:socket,port:55439,user:process.env.USER,database:"postgres",application_name:"vote_cas_admin"};
const admin=new pg.Client(opts);await admin.connect();
const settings=await admin.query("SELECT current_setting('data_directory') AS dir,current_setting('listen_addresses') AS listen");
if(await realpath(settings.rows[0].dir)!==data||settings.rows[0].listen!==""){await admin.end();throw new Error("Refusing non-disposable or TCP-enabled cluster");}
const name=`vote_cas_${randomBytes(8).toString("hex")}`;let pool;
try{
  for(const role of ["anon","authenticated","service_role"])if(!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[role])).rowCount)await admin.query(`CREATE ROLE ${role} NOLOGIN`);
  await admin.query(`CREATE DATABASE ${name}`);pool=new pg.Pool({...opts,database:name,max:15});
  await pool.query(`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.user_identity_map(firebase_subject text PRIMARY KEY,supabase_uid uuid NOT NULL UNIQUE REFERENCES auth.users(id));
    CREATE TABLE public.posts(id text PRIMARY KEY);CREATE TABLE public.reactions(target_type text NOT NULL,target_id text NOT NULL,user_id uuid NOT NULL,reaction_type text NOT NULL,UNIQUE(target_type,target_id,user_id,reaction_type));
    INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001');INSERT INTO public.user_identity_map VALUES ('synthetic','00000000-0000-4000-8000-000000000001');INSERT INTO public.posts VALUES ('post');`);
  await pool.query(await readFile("supabase/proposals/0023_reaction_cas_experiment.sql","utf8"));
  const op=n=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
  const set=(client,desired,expected,id)=>client.query("SELECT public.experimental_set_vote_cas('synthetic','post',$1,$2,$3) AS result",[desired,expected,id]);
  async function blocked(n){const deadline=Date.now()+10000;while(Date.now()<deadline){const r=await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND application_name='vote_cas_worker' AND wait_event_type='Lock'",[name]);if(r.rows[0].n>=n)return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error("Timed out waiting for synthetic locks");}
  const locker=await pool.connect(),workers=await Promise.all(Array.from({length:10},()=>pool.connect()));
  try{
    await Promise.all(workers.map(c=>c.query("SET application_name='vote_cas_worker'")));
    // One uncommitted operation, then ten identical requests wait and replay.
    await locker.query("BEGIN");assert.equal((await set(locker,"upvote",0,op(1))).rows[0].result.version,1);
    const duplicate=Promise.allSettled(workers.map(c=>set(c,"upvote",0,op(1))));await blocked(10);await locker.query("COMMIT");
    assert.ok((await duplicate).every(r=>r.status==="fulfilled"&&r.value.rows[0].result.version===1));
    // One newer operation wins; ten stale competitors must not overwrite it.
    await locker.query("BEGIN");assert.equal((await set(locker,"downvote",1,op(2))).rows[0].result.version,2);
    const stale=Promise.allSettled(workers.map((c,i)=>set(c,"upvote",1,op(i+3))));await blocked(10);await locker.query("COMMIT");
    assert.ok((await stale).every(r=>r.status==="rejected"&&r.reason.code==="40001"));
    assert.deepEqual((await pool.query("SELECT reaction_type FROM public.reactions")).rows,[{reaction_type:"downvote"}]);
    console.log("PASS: synthetic same-operation retries and stale competing vote requests");
  }finally{await locker.query("ROLLBACK").catch(()=>{});locker.release();workers.forEach(c=>c.release());}
}finally{if(pool)await pool.end();await admin.query(`DROP DATABASE IF EXISTS ${name}`);await admin.end();}
