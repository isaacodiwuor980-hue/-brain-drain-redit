import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { IDBFactory } from "fake-indexeddb";
import { openBrainSyncExperiment, readLocalSyncDocument, saveLocalSyncEdit, stageLocalSyncWrite } from "../../../lib/brain-sync-local-experiment";
import { sendPendingBrainExperiment, type BrainSyncTransport } from "../../../lib/brain-sync-orchestrator-experiment";
import { readFile } from "node:fs/promises";
import express from "express";
import type { Server } from "node:http";
// Disposable database and mocked auth; not a real provider, device or network.
const mock=vi.hoisted(()=>({getOne:vi.fn(),rpc:vi.fn(),isConfigured:vi.fn(()=>true)}));
vi.mock('../lib/supabase',()=>({supabase:mock,SupabaseError:class extends Error {constructor(message:string,public status:number,public body?:unknown){super(message);}}}));
vi.mock('../middleware/auth',()=>({requireAuth(req:express.Request,res:express.Response,next:express.NextFunction){const token=req.headers.authorization;if(token!=='Bearer alice'&&token!=='Bearer bob'){res.status(401).end();return;}req.auth={uid:token.slice(7)};next();}}));
import router from './brain-sync-experiment';
import {SupabaseError} from '../lib/supabase';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
let db:PGlite,server:Server,base:string;
beforeAll(async()=>{
  db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${a}'),('${b}');`);
  await db.exec(await readFile('supabase/proposals/0027_brain_sync_document_experiment.sql','utf8'));
  mock.getOne.mockImplementation(async(table:string,options:{filters:Record<string,string>})=>table==='server_feature_flags'?{enabled:true}:options.filters.firebase_subject==='eq.alice'?{supabase_uid:a}:options.filters.firebase_subject==='eq.bob'?{supabase_uid:b}:null);
  mock.rpc.mockImplementation(async(name:string,args:{p_owner:string;p_brain_id:string;p_operation:string;p_expected:number;p_snapshot:unknown})=>{
    if(name!=='brain_sync_save_experiment')throw new Error('unexpected RPC');
    try{return (await db.query<{result:unknown}>('SELECT public.brain_sync_save_experiment($1,$2,$3,$4,$5::jsonb) AS result',[args.p_owner,args.p_brain_id,args.p_operation,args.p_expected,JSON.stringify(args.p_snapshot)])).rows[0].result;}
    catch(error){throw new SupabaseError('synthetic failure',500,JSON.stringify({code:(error as {code?:string}).code}));}
  });
  const app=express();app.use(express.json());app.use('/api',router);await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});const addr=server.address();if(!addr||typeof addr==='string')throw new Error('no port');base=`http://127.0.0.1:${addr.port}`;
},30000);
afterAll(async()=>{if(server)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await db?.close();});
async function save(user:string,operationId:string,expectedRevision:number,title:string){
  const res=await fetch(`${base}/api/experimental/brain-sync`,{method:'POST',headers:{authorization:`Bearer ${user}`,'content-type':'application/json'},body:JSON.stringify({brainId:'brain',operationId,expectedRevision,snapshot:{id:'brain',title}})});
  return {status:res.status,body:await res.json()};
}
describe('simulated two-device synchronization over experimental API',()=>{
  it('deduplicates a retry, prevents stale overwrites and isolates another account',async()=>{
    const op1='10000000-0000-4000-8000-000000000001',op2='10000000-0000-4000-8000-000000000002',op3='10000000-0000-4000-8000-000000000003';
    expect(await save('alice',op1,0,'first')).toEqual({status:200,body:{revision:1,replayed:false}});
    expect(await save('alice',op1,0,'first')).toEqual({status:200,body:{revision:1,replayed:true}});
    expect((await save('alice',op2,1,'device A')).status).toBe(200);
    expect(await save('alice',op3,1,'device B stale')).toEqual({status:409,body:{error:'Brain version conflict'}});
    expect((await save('bob',op1,0,'bob own document')).status).toBe(200);
    const rows=await db.query('SELECT owner_id,revision,snapshot FROM brain_sync_documents_experiment ORDER BY owner_id');
    expect(rows.rows).toEqual([{owner_id:a,revision:2,snapshot:{id:'brain',title:'device A'}},{owner_id:b,revision:1,snapshot:{id:'brain',title:'bob own document'}}]);
  });
  it('retains a lost response and replays the same saved operation from local storage',async()=>{
    vi.stubGlobal('indexedDB',new IDBFactory());const local=await openBrainSyncExperiment();
    try {
      const operation='20000000-0000-4000-8000-000000000001';
      await saveLocalSyncEdit(local,'alice','second-brain',{id:'second-brain',title:'saved'});
      await stageLocalSyncWrite(local,'alice','second-brain',operation);
      const session=async()=>({uid:'alice',token:'alice'});
      let loseResponse=true;
      const send:BrainSyncTransport=async(payload,token)=>{
        const res=await fetch(`${base}/api/experimental/brain-sync`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload)});
        if (loseResponse) {loseResponse=false;throw new Error('response lost after server committed');}
        const body=await res.json();
        return res.status===200?{kind:'ok',revision:body.revision}:res.status===409?{kind:'conflict'}:{kind:'uncertain'};
      };
      expect(await sendPendingBrainExperiment(local,'alice','second-brain',session,send)).toBe('unconfirmed');
      expect((await readLocalSyncDocument(local,'alice','second-brain'))?.sync.status).toBe('pending');
      expect(await sendPendingBrainExperiment(local,'alice','second-brain',session,send)).toBe('acknowledged');
      expect((await readLocalSyncDocument(local,'alice','second-brain'))?.sync).toMatchObject({status:'synced',confirmedRevision:1,pending:null});
      const saved=await db.query('SELECT revision,snapshot FROM brain_sync_documents_experiment WHERE owner_id=$1 AND brain_id=$2',[a,'second-brain']);
      expect(saved.rows).toEqual([{revision:1,snapshot:{id:'second-brain',title:'saved'}}]);
    } finally {local.close();vi.unstubAllGlobals();}
  });

});
