import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const fixture = vi.hoisted(() => ({ get: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: fixture, SupabaseError: class extends Error { status=502; body?: unknown; } }));
vi.mock("../middleware/auth", () => ({ optionalAuth(_req:express.Request,_res:express.Response,next:express.NextFunction){next();}, requireAuth(_req:express.Request,_res:express.Response,next:express.NextFunction){next();} }));
import router from "./feed";
let server: Server, base: string;
const post = {id:"synthetic-post", user_id:"synthetic-author", topic_id:"synthetic-topic", content:"synthetic content", tags:[], post_type:"post", event:null, media_urls:[], brain_id:null, repost_count:0, created_at:"2025-01-01T00:00:00Z", comment_count:0, topic:null, author:null};
beforeAll(async()=>{const app=express();app.use('/api',router);await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});const address=server.address();if(!address||typeof address==='string')throw new Error('No port');base=`http://127.0.0.1:${address.port}`;});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));});
beforeEach(()=>{vi.resetAllMocks();fixture.isConfigured.mockReturnValue(true);});
describe('feed freshness (mocked data)',()=>{
  it('does not continue serving a deleted post from the shared cache',async()=>{
    let exists=true;
    fixture.get.mockImplementation(async(table:string)=>table==='posts'?(exists?[post]:[]):[]);
    const first=await fetch(`${base}/api/feed?topic=freshness-regression`);expect((await first.json()).posts).toHaveLength(1);
    expect(first.headers.get('cache-control')).toContain('no-store');
    exists=false;
    const second=await fetch(`${base}/api/feed?topic=freshness-regression`);
    expect((await second.json()).posts).toEqual([]);
  });
});
