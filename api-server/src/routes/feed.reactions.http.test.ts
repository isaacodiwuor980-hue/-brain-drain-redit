import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const db = vi.hoisted(() => ({ get: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db, SupabaseError: class extends Error { status = 500; body?: unknown; } }));
vi.mock("../middleware/auth", () => ({ optionalAuth(req: express.Request, _res: express.Response, next: express.NextFunction) {
  const uid = req.headers.authorization?.replace("Bearer ", "");
  if (uid) req.auth = { uid } as express.Request["auth"];
  next();
} }));
import router from "./feed";
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => { vi.clearAllMocks(); db.isConfigured.mockReturnValue(true); });
const post = { id: "post-1", user_id: "author", topic_id: "test", content: "hello", post_type: "post", event: null, media_urls: [], brain_id: null, repost_count: 0, created_at: "2025-01-01T00:00:00Z", comment_count: 0, topic: null, author: null };
const reactions = [
  { target_id: "post-1", user_id: "alice", reaction_type: "repost" },
  { target_id: "post-1", user_id: "alice", reaction_type: "upvote" },
  { target_id: "post-1", user_id: "bob", reaction_type: "downvote" },
];
async function get(path: string, user?: string) {
  const res = await fetch(`${base}${path}`, { headers: user ? { authorization: `Bearer ${user}` } : {} });
  return { res, body: await res.json() };
}
describe("feed personalization with mocked database", () => {
  it("returns all of the viewer's reaction types on cold and shared cached responses, without exposing other users", async () => {
    db.get.mockResolvedValueOnce([post]).mockResolvedValueOnce(reactions);
    const alice = await get("/api/feed?topic=test-multiple-reactions", "alice");
    expect(alice.res.headers.get("x-feed-cache")).toBe("MISS");
    expect(alice.body.posts[0].userReactions).toEqual({ repost: ["alice"], upvote: ["alice"] });
    expect(alice.body.posts[0].reactions).toEqual({ upvote: 1, downvote: 1, repost: 1 });
    const bob = await get("/api/feed?topic=test-multiple-reactions", "bob");
    expect(bob.res.headers.get("x-feed-cache")).toBe("HIT");
    expect(bob.body.posts[0].userReactions).toEqual({ downvote: ["bob"] });
    expect(JSON.stringify(bob.body)).not.toContain("alice");
    const guest = await get("/api/feed?topic=test-multiple-reactions");
    expect(guest.body.posts[0].userReactions).toBeUndefined();
  });
  it("does not place personalized following pages in the shared feed cache", async () => {
    db.get.mockImplementation(async (table: string) => table === "user_follows" ? [{ followee_id: "author" }] : table === "posts" ? [post] : reactions);
    const first = await get("/api/feed?mode=following&topic=test-following", "alice");
    const second = await get("/api/feed?mode=following&topic=test-following", "bob");
    expect(first.res.headers.get("x-feed-cache")).toBe("MISS");
    expect(second.res.headers.get("x-feed-cache")).toBe("MISS");
    expect(second.body.posts[0].userReactions).toEqual({ downvote: ["bob"] });
    expect(db.get.mock.calls.filter(call => call[0] === "posts")).toHaveLength(2);
  });
  it("returns a controlled error when the following lookup fails", async () => {
    db.get.mockRejectedValueOnce(new Error("private upstream details"));
    const { res, body } = await get("/api/feed?mode=following", "alice");
    expect(res.status).toBe(502);
    expect(body).toEqual({ error: "Feed data source unavailable" });
  });
});
