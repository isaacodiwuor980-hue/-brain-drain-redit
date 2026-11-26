// Synthetic-only PostgreSQL test. No TCP, production, real accounts or API.
import pg from "pg";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {readFile,realpath} from "node:fs/promises";
const socket=await realpath(".cache/pg-local/socket"),data=await realpath(".cache/pg-local/data");
const config={host:socket,port:55439,user:process.env.USER,database:"postgres",application_name:"ticket_test_admin"};
const admin=new pg.Client(config);await admin.connect();
const settings=await admin.query("SELECT current_setting('data_directory') AS dir,current_setting('listen_addresses') AS listen");
if(await realpath(settings.rows[0].dir)!==data||settings.rows[0].listen!==""){await admin.end();throw new Error("Refusing non-disposable or TCP-enabled cluster");}
const name=`ticket_test_${randomBytes(8).toString("hex")}`;let pool;
try{
  for(const role of ["anon","authenticated","service_role"])if(!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[role])).rowCount)await admin.query(`CREATE ROLE ${role} NOLOGIN`);
  await admin.query(`CREATE DATABASE ${name}`);pool=new pg.Pool({...config,database:name,max:14});
  await pool.query(`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.topics(id text PRIMARY KEY);CREATE TABLE public.brains(id text PRIMARY KEY,is_public boolean NOT NULL);
    CREATE TABLE public.posts(id text PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,topic_id text NOT NULL REFERENCES public.topics(id),content text NOT NULL,brain_id text REFERENCES public.brains(id));
    INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001');INSERT INTO public.topics VALUES ('synthetic');`);
  await pool.query(await readFile("supabase/proposals/0019_brain_post_visibility.sql","utf8"));
  await pool.query(await readFile("supabase/proposals/0022_post_retry_ticket.sql","utf8"));
  const uid="00000000-0000-4000-8000-000000000001";
  async function issue(){return (await pool.query("SELECT public.experimental_issue_post_ticket($1) AS ticket",[uid])).rows[0].ticket;}
  const submit=(client,ticket)=>client.query("SELECT public.experimental_create_post_with_ticket($1,$2,'synthetic','synthetic',NULL) AS outcome",[uid,ticket]);
  async function blocked(n){const deadline=Date.now()+10000;while(Date.now()<deadline){const result=await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND application_name='ticket_test_worker' AND wait_event_type='Lock'",[name]);if(result.rows[0].n>=n)return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error("Timed out waiting for synthetic test locks");}
  const locker=await pool.connect(),workers=await Promise.all(Array.from({length:10},()=>pool.connect()));
  try{
    await Promise.all(workers.map(c=>c.query("SET application_name='ticket_test_worker'")));
    const ticket=await issue();await locker.query("BEGIN");assert.equal((await submit(locker,ticket)).rows[0].outcome,"created");
    const pending=Promise.allSettled(workers.map(c=>submit(c,ticket)));await blocked(10);await locker.query("COMMIT");
    assert.ok((await pending).every(r=>r.status==="fulfilled"&&r.value.rows[0].outcome==="replayed"));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.posts WHERE id=$1",[ticket])).rows[0].n,1);
    await locker.query("BEGIN");await locker.query("DELETE FROM public.posts WHERE id=$1",[ticket]);
    const stale=Promise.allSettled(workers.map(c=>submit(c,ticket)));await blocked(10);await locker.query("COMMIT");
    assert.ok((await stale).every(r=>r.status==="rejected"&&r.reason.code==="23505"));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.posts WHERE id=$1",[ticket])).rows[0].n,0);
    const ticket2=await issue();await submit(pool,ticket2);await locker.query("BEGIN");
    assert.equal((await submit(locker,ticket2)).rows[0].outcome,"replayed");
    const deletion=workers[0].query("DELETE FROM public.posts WHERE id=$1",[ticket2]);await blocked(1);await locker.query("COMMIT");await deletion;
    await assert.rejects(submit(pool,ticket2),e=>e.code==="23505");
    await pool.query("UPDATE public.experimental_post_tickets SET expires_at=clock_timestamp()-interval '1 second' WHERE ticket_id=$1",[ticket2]);
    await pool.query("DELETE FROM public.experimental_post_tickets WHERE ticket_id=$1",[ticket2]);
    await assert.rejects(submit(pool,ticket2),e=>e.code==="23505");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.posts WHERE id=$1",[ticket2])).rows[0].n,0);
    console.log("PASS: synthetic ticket create/retry and deletion schedules; purged expired ticket rejected");
  }finally{await locker.query("ROLLBACK").catch(()=>{});locker.release();workers.forEach(c=>c.release());}
}finally{if(pool)await pool.end();await admin.query(`DROP DATABASE IF EXISTS ${name}`);await admin.end();}
