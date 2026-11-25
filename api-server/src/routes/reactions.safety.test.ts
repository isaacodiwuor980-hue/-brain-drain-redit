import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ get: vi.fn(), getOne: vi.fn(), insert: vi.fn(), delete: vi.fn(), rpc: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db, SupabaseError: class extends Error {} }));
vi.mock("../middleware/auth", () => ({
  requireAuth(req: express.Request, _res: express.Response, next: express.NextFunction) { req.auth = { uid: "user-1" } as express.Request["auth"]; next(); },
  optionalAuth(_req: express.Request, _res: express.Response, next: express.NextFunction) { next(); },
}));
import posts, { legacyReactionHandlerForTests } from "./posts";
import feed from "./feed";
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json());
  // Exercise the unmounted legacy implementation in a synthetic fixture only.
  app.post("/api-legacy/posts/:id/react", (req, _res, next) => {req.auth = {uid:"user-1"}; next();}, legacyReactionHandlerForTests);
  app.use("/api", posts, feed);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => { vi.clearAllMocks(); db.isConfigured.mockReturnValue(true); });
describe("unmounted legacy behavior and ordinary feed in synthetic fixtures", () => {
  it("writes a regular reaction without consulting the flag or invoking the mutating RPC", async () => {
    db.getOne.mockResolvedValue({ id: "post1" });
    db.get.mockResolvedValueOnce([]).mockResolvedValueOnce([{ reaction_type: "upvote" }]);
    db.insert.mockResolvedValue({});
    const res = await fetch(`${base}/api-legacy/posts/post1/react`, { method: "POST", headers: { "content-type": "application/json", "x-enable-feature": "false" }, body: JSON.stringify({ reactionType: "upvote" }) });
    expect(res.status).toBe(200); expect(await res.json()).toEqual({ postId: "post1", reactions: { upvote: 1, downvote: 0, repost: 0 } });
    expect(db.insert).toHaveBeenCalledOnce(); expect(db.rpc).not.toHaveBeenCalled();
    expect(db.getOne.mock.calls.every(call => call[0] !== "server_feature_flags")).toBe(true);
  });
  it("continues to serve a degraded feed without flags or the database", async () => {
    db.isConfigured.mockReturnValue(false);
    for (const mode of ["foryou", "following"]) {
      const res = await fetch(`${base}/api/feed?mode=${mode}`);
      expect(res.status).toBe(200); expect(await res.json()).toMatchObject({ posts: [], hasMore: false });
    }
    expect(db.getOne).not.toHaveBeenCalled(); expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("unmounted legacy reaction transitions with a mocked database", () => {
  it.each([
    { label: "switches up to down", existing: [{ id: "vote-up", reaction_type: "upvote" }], next: "downvote", deleted: ["vote-up"], insert: true },
    { label: "switches down to up", existing: [{ id: "vote-down", reaction_type: "downvote" }], next: "upvote", deleted: ["vote-down"], insert: true },
    { label: "toggles the active vote off", existing: [{ id: "vote-up", reaction_type: "upvote" }], next: "upvote", deleted: ["vote-up"], insert: false },
    { label: "cleans inconsistent legacy votes when toggled off", existing: [{ id: "vote-down", reaction_type: "downvote" }, { id: "vote-up", reaction_type: "upvote" }], next: "upvote", deleted: ["vote-down", "vote-up"], insert: false },
  ])("$label", async ({ existing, next, deleted, insert }) => {
    db.getOne.mockResolvedValueOnce({ id: "post1" });
    db.get.mockResolvedValueOnce(existing).mockResolvedValueOnce([]);
    db.delete.mockResolvedValue(undefined); db.insert.mockResolvedValue(undefined);
    const res = await fetch(`${base}/api-legacy/posts/post1/react`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reactionType: next }) });
    expect(res.status).toBe(200);
    expect(db.delete.mock.calls.map(call => call[1].id)).toEqual(deleted);
    expect(db.insert).toHaveBeenCalledTimes(insert ? 1 : 0);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("post creation timestamp validation", () => {
  it("rejects an out-of-range date before writing instead of throwing during serialization", async () => {
    const res = await fetch(`${base}/api/posts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "post1", topicId: "topic1", content: "hello", createdAt: 8_640_000_000_000_001 }) });
    expect(res.status).toBe(400); expect(db.insert).not.toHaveBeenCalled();
  });
  it("accepts an ordinary creation timestamp", async () => {
    db.insert.mockResolvedValueOnce(undefined);
    const createdAt = 1_700_000_000_000;
    const res = await fetch(`${base}/api/posts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "post1", topicId: "topic1", content: "hello", createdAt }) });
    expect(res.status).toBe(201); expect((await res.json()).post.createdAt).toBe(createdAt);
  });
});
