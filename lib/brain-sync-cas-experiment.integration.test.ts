import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
let db: PGlite;
const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002';
const op1='10000000-0000-4000-8000-000000000001',op2='10000000-0000-4000-8000-000000000002',op3='10000000-0000-4000-8000-000000000003';
async function save(owner:string,id:string,operation:string,expected:number,snapshot:unknown) {
  return (await db.query<{result:{revision:number,replayed:boolean}}>('SELECT public.brain_sync_save_experiment($1,$2,$3,$4,$5::jsonb) AS result',[owner,id,operation,expected,JSON.stringify(snapshot)])).rows[0].result;
}
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${alice}'),('${bob}');`);
  await db.exec(await readFile('supabase/proposals/0027_brain_sync_document_experiment.sql','utf8'));
});
afterAll(async()=>db.close());
beforeEach(async()=>db.exec('TRUNCATE brain_sync_documents_experiment,brain_sync_operations_experiment'));
describe('synthetic account-scoped brain sync experiment',()=>{
  it('creates once, replays a lost response without another write, and rejects different content under the same operation',async()=>{
    const snapshot={id:'brain',nodes:[{id:'n',text:'first'}]};
    expect(await save(alice,'brain',op1,0,snapshot)).toEqual({revision:1,replayed:false});
    expect(await save(alice,'brain',op1,0,snapshot)).toEqual({revision:1,replayed:true});
    await expect(save(alice,'brain',op1,0,{...snapshot,nodes:[]})).rejects.toThrow(/Operation ID reused/);
    expect((await db.query('SELECT revision,snapshot FROM brain_sync_documents_experiment')).rows).toEqual([{revision:1,snapshot}]);
  });
  it('detects stale edits without discarding the stored version',async()=>{
    await save(alice,'brain',op1,0,{id:'brain',title:'v1'});
    await save(alice,'brain',op2,1,{id:'brain',title:'v2'});
    await expect(save(alice,'brain',op3,1,{id:'brain',title:'stale'})).rejects.toThrow(/version conflict/);
    const row=(await db.query<{revision:number,snapshot:unknown}>('SELECT revision,snapshot FROM brain_sync_documents_experiment')).rows[0];
    expect(row).toEqual({revision:2,snapshot:{id:'brain',title:'v2'}});
    expect((await db.query('SELECT * FROM brain_sync_operations_experiment')).rows).toHaveLength(2);
  });
  it('isolates same brain ids by owner, rejects bad IDs and does not let browser roles execute the RPC',async()=>{
    await save(alice,'brain',op1,0,{id:'brain',title:'a'});
    await save(bob,'brain',op1,0,{id:'brain',title:'b'});
    expect((await db.query('SELECT * FROM brain_sync_documents_experiment')).rows).toHaveLength(2);
    await expect(save(alice,'brain',op2,1,{id:'other'})).rejects.toThrow(/Invalid sync payload/);
    await db.exec('SET ROLE authenticated');
    try { await expect(save(bob,'brain',op2,1,{id:'brain'})).rejects.toThrow(); }
    finally { await db.exec('RESET ROLE'); }
  });
  it('documents that a privileged caller may spoof an owner',async()=>{
    await db.exec('SET ROLE service_role');
    try { expect(await save(bob,'brain',op1,0,{id:'brain',title:'spoofed'})).toEqual({revision:1,replayed:false}); }
    finally { await db.exec('RESET ROLE'); }
  });
});
