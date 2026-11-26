import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db=vi.hoisted(()=>({getOne:vi.fn(),rpc:vi.fn(),isConfigured:vi.fn(()=>true)}));
vi.mock('../lib/supabase',()=>({supabase:db,SupabaseError:class extends Error {constructor(message:string,public status:number,public body?:unknown){super(message);}}}));
vi.mock('../middleware/auth',()=>({requireAuth(req:express.Request,res:express.Response,next:express.NextFunction){const user=req.headers.authorization?.replace('Bearer ','');if(!user){res.status(401).json({error:'Authentication required'});return;}req.auth={uid:user};next();}}));
import router from './brain-sync-experiment';
import {SupabaseError} from '../lib/supabase';
const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002';
const input={brainId:'brain',operationId:'10000000-0000-4000-8000-000000000001',expectedRevision:0,snapshot:{id:'brain',title:'local'}};
let server:Server,base:string;
beforeAll(async()=>{const app=express();app.use(express.json({limit:'2mb'}));app.use('/api',router);await new Promise<void>(r=>{server=app.listen(0,'127.0.0.1',r);});const addr=server.address();if(!addr||typeof addr==='string')throw new Error('no port');base=`http://127.0.0.1:${addr.port}`;});
afterAll(async()=>{await new Promise<void>((r,reject)=>server.close(e=>e?reject(e):r()));});
beforeEach(()=>{vi.resetAllMocks();db.isConfigured.mockReturnValue(true);db.rpc.mockResolvedValue({revision:1,replayed:false});db.getOne.mockImplementation(async(table:string,opts:{filters:Record<string,string>})=>table==='server_feature_flags'?{enabled:true}:opts.filters.firebase_subject==='eq.alice'?{supabase_uid:alice}:opts.filters.firebase_subject==='eq.bob'?{supabase_uid:bob}:null);});
async function save(user?:string,body:unknown=input){return fetch(`${base}/api/experimental/brain-sync`,{method:'POST',headers:{'content-type':'application/json',...(user?{authorization:`Bearer ${user}`}:{})},body:JSON.stringify(body)});}
describe('default-off brain-sync API (isolated mocked auth and storage)',()=>{
  it('does not write when flag is absent, disabled or unavailable',async()=>{
    db.getOne.mockResolvedValueOnce(null);expect((await save('alice')).status).toBe(404);
    db.getOne.mockRejectedValueOnce(new Error('private'));expect((await save('alice')).status).toBe(503);expect(db.rpc).not.toHaveBeenCalled();
  });
  it('requires authentication and verified identity, rejects supplied owner',async()=>{
    expect((await save()).status).toBe(401);expect((await save('unknown')).status).toBe(403);
    expect((await save('alice',{...input,ownerId:bob})).status).toBe(400);expect(db.rpc).not.toHaveBeenCalled();
  });
  it('sends only server-mapped owner and returns acknowledged revision without storing response',async()=>{
    const res=await save('bob');expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toContain('no-store');
    expect(await res.json()).toEqual({revision:1,replayed:false});
    expect(db.rpc).toHaveBeenCalledWith('brain_sync_save_experiment',{p_owner:bob,p_brain_id:'brain',p_operation:input.operationId,p_expected:0,p_snapshot:input.snapshot});
  });
  it('rejects mismatched identifiers and oversized snapshots',async()=>{
    expect((await save('alice',{...input,snapshot:{id:'different'}})).status).toBe(400);
    expect((await save('alice',{...input,snapshot:{id:'brain',content:'x'.repeat(1_048_576)}})).status).toBe(413);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('reports conflicts without details and preserves uncertainty on other errors',async()=>{
    db.rpc.mockRejectedValueOnce(new SupabaseError('upstream',409,JSON.stringify({code:'40001',details:'sensitive'})));
    const conflict=await save('alice');expect(conflict.status).toBe(409);expect(JSON.stringify(await conflict.json())).not.toContain('sensitive');
    db.rpc.mockRejectedValueOnce(new Error('sensitive'));const uncertain=await save('alice');expect(uncertain.status).toBe(503);expect(await uncertain.json()).toEqual({error:'Sync status unconfirmed'});
  });
  it('does not acknowledge malformed database responses',async()=>{
    db.rpc.mockResolvedValueOnce({revision:3,replayed:false});const res=await save('alice');expect(res.status).toBe(503);expect(await res.json()).toEqual({error:'Sync status unconfirmed'});
  });
});
