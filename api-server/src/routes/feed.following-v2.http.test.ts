import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ get: vi.fn(), getOne: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db, SupabaseError: class extends Error {} }));
vi.mock("../middleware/auth", () => ({
  optionalAuth(_req: express.Request, _res: express.Response, next: express.NextFunction) { next(); },
  requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const uid = req.headers.authorization?.replace("Bearer ", "");
    if (!uid) { res.status(401).json({ error: "Authentication required" }); return; }
    req.auth = { uid }; next();
  },
}));
import router from "./feed";
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const author = "00000000-0000-4000-8000-000000000003";
const post = { id: "post-1", user_id: author, topic_id: "test", content: "hello", post_type: "post", event: null, media_urls: [], brain_id: null, repost_count: 0, created_at: "2025-01-01T00:00:00Z", comment_count: 0, topic: null, author: null };
let server: Server, base: string;
beforeAll(async () => { const app = express(); app.use("/api", router); await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); }); const addr = server.address(); if (!addr || typeof addr === "string") throw new Error("No port"); base = `http://127.0.0.1:${addr.port}`; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => {
  vi.resetAllMocks(); db.isConfigured.mockReturnValue(true);
  db.getOne.mockImplementation(async (table: string, opts: { filters: Record<string, string> }) => table === "server_feature_flags" ? { enabled: true } : opts.filters.firebase_subject === "eq.alice" ? { supabase_uid: alice } : opts.filters.firebase_subject === "eq.bob" ? { supabase_uid: bob } : null);
  db.get.mockImplementation(async (table: string, opts: { filters: Record<string, string> }) => table === "follows" ? (opts.filters.follower_id === `eq.${alice}` ? [{ following_id: author }] : []) : table === "posts" ? [post] : [{ target_id: "post-1", reaction_type: "upvote", user_id: alice }]);
});
async function get(user?: string, query = "") { const res = await fetch(`${base}/api/feed/following-v2${query}`, { headers: user ? { authorization: `Bearer ${user}` } : {} }); return { res, body: await res.json() }; }
describe("following v2 (mocked auth and database; default off)", () => {
  it("is unavailable when the server flag is absent or disabled", async () => { db.getOne.mockResolvedValue(null); const { res } = await get("alice"); expect(res.status).toBe(404); expect(db.get).not.toHaveBeenCalled(); });
  it("fails closed if the flag lookup fails", async () => { db.getOne.mockRejectedValueOnce(new Error("sensitive upstream details")); const result = await get("alice"); expect(result.res.status).toBe(503); expect(JSON.stringify(result.body)).not.toContain("sensitive"); expect(db.get).not.toHaveBeenCalled(); });
  it("requires authentication and a verified mapping", async () => { expect((await get()).res.status).toBe(401); expect((await get("unknown")).res.status).toBe(403); expect(db.get).not.toHaveBeenCalled(); });
  it("queries only the mapped caller's follows and their posts without shared caching", async () => {
    const first = await get("alice", "?limit=1&offset=2"); expect(first.res.status).toBe(200); expect(first.res.headers.get("cache-control")).toBe("no-store");
    expect(db.get).toHaveBeenCalledWith("follows", expect.objectContaining({ filters: { follower_id: `eq.${alice}` } }));
    expect(db.get).toHaveBeenCalledWith("posts", expect.objectContaining({ filters: { user_id: `in.("${author}")` }, limit: 2, offset: 2 }));
    const postQuery = db.get.mock.calls.find(call => call[0] === "posts")?.[1]; expect(postQuery.select).not.toMatch(/\btags\b/);
    expect(first.body.posts[0].tags).toEqual([]); expect(first.body.posts[0].userReactions).toEqual({ upvote: [alice] });
    const second = await get("bob"); expect(second.body.posts).toEqual([]); expect(db.get.mock.calls.filter(call => call[0] === "posts")).toHaveLength(1);
  });
  it("rejects malformed follows and fails closed on lookup or mapping failures", async () => {
    db.get.mockResolvedValueOnce([{ following_id: 'bad")' }]); expect((await get("alice")).res.status).toBe(502); expect(db.get.mock.calls.filter(call => call[0] === "posts")).toHaveLength(0);
    db.getOne.mockImplementationOnce(async () => ({enabled:true})).mockRejectedValueOnce(new Error("private details")); const result = await get("alice"); expect(result.res.status).toBe(503); expect(JSON.stringify(result.body)).not.toContain("private");
  });
  it("does not silently truncate large follow graphs", async () => { db.get.mockResolvedValueOnce(Array.from({length: 501}, () => ({following_id: author}))); expect((await get("alice")).res.status).toBe(503); expect(db.get.mock.calls.filter(call => call[0] === "posts")).toHaveLength(0); });
  it("rejects invalid pagination before querying posts", async () => { expect((await get("alice", "?offset=-1")).res.status).toBe(400); expect(db.get).not.toHaveBeenCalled(); });
});
