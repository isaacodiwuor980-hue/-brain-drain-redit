import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db=vi.hoisted(()=>({get:vi.fn(),isConfigured:vi.fn(()=>true)}));
vi.mock("../lib/supabase",()=>({supabase:db,SupabaseError:class extends Error { constructor(message:string,public status:number){super(message);} }}));
vi.mock("../middleware/auth",()=>({optionalAuth(_req:express.Request,_res:express.Response,next:express.NextFunction){next();},requireAuth(_req:express.Request,_res:express.Response,next:express.NextFunction){next();}}));
import router from "./feed";
let server:Server, base:string;
const post=(id:string,time:string)=>({id,user_id:'author',topic_id:'topic',content:'synthetic',tags:[],post_type:'post',event:null,media_urls:[],brain_id:null,repost_count:0,created_at:time,comment_count:0,topic:null,author:null});
beforeAll(async()=>{const app=express();app.use('/api',router);await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});const address=server.address();if(!address||typeof address==='string')throw new Error('No port');base=`http://127.0.0.1:${address.port}`;});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));});
beforeEach(()=>{vi.resetAllMocks();db.isConfigured.mockReturnValue(true);});
describe('chronological cursor (mocked PostgREST)',()=>{
 it('returns the exact last timestamp including microseconds and supplies a keyset filter',async()=>{
  const time='2026-11-16T12:00:00.123456+00:00';
  db.get.mockImplementation(async(table:string)=>table==='posts'?[post('a',time),post('b',time),post('c',time)]:[]);
  const first=await fetch(`${base}/api/feed?limit=2`);const body=await first.json();
  expect(body.nextCursor).toEqual({createdAt:time,id:'b'});
  const params=new URLSearchParams({limit:'2',cursorCreatedAt:body.nextCursor.createdAt,cursorId:body.nextCursor.id});
  await fetch(`${base}/api/feed?${params}`);
  expect(db.get).toHaveBeenLastCalledWith('reactions',expect.anything());
  const queries=db.get.mock.calls.filter(call=>call[0]==='posts');
  expect(queries[1][1].filters.or).toBe(`(created_at.lt."${time}",and(created_at.eq."${time}",id.gt."b"))`);
  expect(queries[1][1].offset).toBe(0);
 });
 it('rejects partial, malformed, injected and cursor-plus-offset requests before querying',async()=>{
  for(const params of [
   {cursorId:'a'}, {cursorCreatedAt:'2026-11-16T12:00:00Z'},
   {cursorCreatedAt:'2026-11-16T12:00:00Z',cursorId:'bad"),or(true'},
   {cursorCreatedAt:'2026-11-16T12:00:00Z"),bad',cursorId:'a'},
   {cursorCreatedAt:'2026-11-16T12:00:00Z',cursorId:'a',offset:'1'},
  ]) {
   const response=await fetch(`${base}/api/feed?${new URLSearchParams(params)}`);expect(response.status).toBe(400);
  }
  expect(db.get).not.toHaveBeenCalled();
 });
 it('fails closed if the next cursor cannot be safely constructed',async()=>{
  db.get.mockImplementation(async(table:string)=>table==='posts'?[post('a','bad'),post('b','bad')]:[]);
  const response=await fetch(`${base}/api/feed?limit=1`);
  expect(response.status).toBe(502);
 });
});
