import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const db = vi.hoisted(() => ({ get: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db, SupabaseError: class extends Error { status = 500; body?: unknown; } }));
vi.mock("../middleware/auth", () => ({ requireAuth(_req: express.Request, _res: express.Response, next: express.NextFunction) { next(); }, optionalAuth(req: express.Request, _res: express.Response, next: express.NextFunction) {
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
  it("never reads or returns vote data in fresh responses", async () => {
    db.get.mockImplementation(async (table: string) => table === "posts" ? [post] : reactions);
    const alice = await get("/api/feed?topic=test-multiple-reactions", "alice");
    expect(alice.res.headers.get("x-feed-cache")).toBe("MISS");
    expect(alice.body.posts[0].userReactions).toBeUndefined();
    expect(db.get).toHaveBeenCalledWith("reactions", expect.objectContaining({select: "target_id,reaction_type", filters: expect.objectContaining({reaction_type: "eq.repost"})}));
    // The fixture ignores the reaction filter, but voter identities and vote
    // types must not be returned. Post author identity is separate.
    expect(JSON.stringify(alice.body)).not.toContain("alice");
    expect(JSON.stringify(alice.body)).not.toContain("bob");
    expect(alice.body.posts[0].reactions).toEqual({ repost: 1 });
    expect(alice.body.posts[0].reactions).not.toHaveProperty("upvote");
    expect(alice.body.posts[0].reactions).not.toHaveProperty("downvote");
    const bob = await get("/api/feed?topic=test-multiple-reactions", "bob");
    expect(bob.res.headers.get("x-feed-cache")).toBe("MISS");
    expect(bob.res.headers.get("cache-control")).toBe("no-store");
    expect(bob.body.posts[0].userReactions).toBeUndefined();
    expect(JSON.stringify(bob.body)).not.toContain("alice");
    const guest = await get("/api/feed?topic=test-multiple-reactions");
    expect(guest.body.posts[0].userReactions).toBeUndefined();
    expect(guest.body.posts[0].reactions).toEqual({ repost: 1 });
    expect(bob.body.posts[0].reactions).toEqual({ repost: 1 });
  });
  it("pauses legacy following without querying an unverified identity graph", async () => {
    for (const user of ["alice", "bob", undefined]) {
      const {res, body} = await get("/api/feed?mode=following&topic=test-following", user);
      expect(res.status).toBe(503);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(body.error).toContain("unavailable");
    }
    expect(db.get).not.toHaveBeenCalled();
  });
  it("does not expose upstream feed errors", async () => {
    db.get.mockRejectedValueOnce(new Error("private upstream details"));
    const { res, body } = await get("/api/feed?topic=upstream-error", "alice");
    expect(res.status).toBe(502);
    expect(body).toEqual({ error: "Feed data source unavailable" });
  });
});
