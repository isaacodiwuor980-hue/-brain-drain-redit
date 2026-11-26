import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
const db=vi.hoisted(()=>({isConfigured:vi.fn(()=>true),getOne:vi.fn(),insert:vi.fn()}));
vi.mock('../lib/supabase',()=>({supabase:db,SupabaseError:class extends Error {status=500;body?:unknown;}}));
vi.mock('../middleware/auth',()=>({requireAuth(req:express.Request,res:express.Response,next:express.NextFunction){const uid=req.header('x-synthetic-user');if(!uid){res.status(401).json({error:'Authentication required'});return;}req.auth={uid};next();}}));
import router from './posts';
const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002';
let server:Server,base:string;
beforeAll(async()=>{const app=express();app.use(express.json());app.use('/api',router);await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});const addr=server.address();if(!addr||typeof addr==='string')throw new Error('no port');base=`http://127.0.0.1:${addr.port}`;});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));});
beforeEach(()=>{
 vi.resetAllMocks();db.isConfigured.mockReturnValue(true);db.insert.mockResolvedValue(undefined);
 db.getOne.mockImplementation(async(table:string,opts:{filters:Record<string,string>})=>table==='user_identity_map' ? opts.filters.firebase_subject==='eq.alice'?{supabase_uid:alice}:opts.filters.firebase_subject==='eq.bob'?{supabase_uid:bob}:null : null);
});
async function create(user?:string,body:unknown={id:'post-1',topicId:'topic-1',content:'synthetic',audience:'public'}){
 const res=await fetch(`${base}/api/posts`,{method:'POST',headers:{'content-type':'application/json',...(user?{'x-synthetic-user':user}:{})},body:JSON.stringify(body)});
 return {res,body:await res.json()};
}
describe('post author identity (mocked Firebase and database)',()=>{
 it('inserts only the server-resolved mapped author',async()=>{
  const result=await create('alice');expect(result.res.status).toBe(201);
  expect(db.insert).toHaveBeenCalledWith('posts',expect.objectContaining({user_id:alice}));
  expect(result.body.post.userId).toBe(alice);
 });
 it('rejects unmapped subjects even if their Firebase UID looks like another user UUID',async()=>{
  expect((await create(bob)).res.status).toBe(403);expect(db.insert).not.toHaveBeenCalled();
 });
 it('blocks writes on mapping failure without leaking upstream details',async()=>{
  db.getOne.mockRejectedValue(new Error('synthetic private detail'));
  const result=await create('alice');expect(result.res.status).toBe(503);
  expect(JSON.stringify(result.body)).not.toContain('synthetic private detail');expect(db.insert).not.toHaveBeenCalled();
 });
 it('never accepts a client-selected author',async()=>{
  const result=await create('alice',{id:'post-1',topicId:'topic-1',content:'synthetic',audience:'public',userId:bob});
  expect(result.res.status).toBe(400);expect(db.insert).not.toHaveBeenCalled();
 });
 it('requires explicit public audience and rejects private or unknown fields',async()=>{
  for(const extra of [{},{audience:'private'},{audience:'public',roomId:'private-room'},{audience:'public',event:{title:'event',startsAt:1,communityId:'room'}}]) {
   const result=await create('alice',{id:'post-1',topicId:'topic-1',content:'synthetic',...extra});
   expect(result.res.status).toBe(400);
  }
  expect(db.insert).not.toHaveBeenCalled();
 });

});
