import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
let db: PGlite;
const a="00000000-0000-4000-8000-000000000001", b="00000000-0000-4000-8000-000000000002";
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE brains(id text primary key,author_id uuid,title text,category text,description text,root_node_id text,is_public boolean,is_favorite boolean,repo_status text,active_branch text,created_at timestamptz,secret text);
    CREATE TABLE brain_nodes(id text primary key,brain_id text,node_type text,question_text text,result_text text,next_steps text,if_true_node_id text,if_false_node_id text,attachments jsonb,secret text);
    GRANT SELECT ON brains,brain_nodes TO service_role;
    INSERT INTO brains(id,author_id,title,is_public,is_favorite,repo_status,created_at,secret) VALUES ('private','${a}','Private',false,false,'public_repo',now(),'secret-field'),('public','${a}','Public',true,false,null,now(),'secret-field');
    INSERT INTO brain_nodes(id,brain_id,node_type,attachments,secret) VALUES ('n','private','outcome','[]','secret-node'),('p','public','outcome','[]','secret-node');`);
  await db.exec(await readFile('supabase/live-reviewed/20261125232907_brain_detail_snapshot.sql','utf8'));
});
afterAll(async()=>db.close());
async function read(id:string,uid:string|null) { return (await db.query<{item:unknown}>('SELECT read_brain_detail_v2($1,$2) AS item',[id,uid])).rows[0].item; }
describe('atomic brain detail with synthetic rows',()=>{
  it('returns public details without identity, omitting unprojected columns',async()=>{
    const item=await read('public',null);
    expect(item).toMatchObject({brain:{id:'public'},nodes:[{id:'p'}]});
    expect(JSON.stringify(item)).not.toContain('secret');
  });
  it('returns private details only to supplied owner and not for legacy public repo status',async()=>{
    expect(await read('private',null)).toBeNull(); expect(await read('private',b)).toBeNull();
    expect(await read('private',a)).toMatchObject({brain:{id:'private'},nodes:[{id:'n'}]});
    expect(await read('missing',a)).toBeNull();
  });
  it('prevents browser roles from executing the privileged API function',async()=>{
    for(const role of ['anon','authenticated']) { await db.exec(`SET ROLE ${role}`); try { await expect(read('private',a)).rejects.toThrow(); } finally {await db.exec('RESET ROLE');} }
    await db.exec('SET ROLE service_role'); try { expect(await read('private',a)).not.toBeNull(); } finally {await db.exec('RESET ROLE');}
  });
});
