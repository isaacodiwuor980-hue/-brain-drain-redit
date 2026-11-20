import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ get: vi.fn(), getOne: vi.fn(), insert: vi.fn(), delete: vi.fn(), rpc: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db, SupabaseError: class extends Error {} }));
vi.mock("../middleware/auth", () => ({
  requireAuth(req: express.Request, _res: express.Response, next: express.NextFunction) { req.auth = { uid: "user-1" } as express.Request["auth"]; next(); },
  optionalAuth(_req: express.Request, _res: express.Response, next: express.NextFunction) { next(); },
}));
import posts from "./posts";
import feed from "./feed";
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/api", posts, feed);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => { vi.clearAllMocks(); db.isConfigured.mockReturnValue(true); });
describe("ordinary feed and reactions stay independent of TSRG flags", () => {
  it("writes a regular reaction without consulting the flag or invoking the mutating RPC", async () => {
    db.getOne.mockResolvedValue({ id: "post1" });
    db.get.mockResolvedValueOnce([]).mockResolvedValueOnce([{ reaction_type: "upvote" }]);
    db.insert.mockResolvedValue({});
    const res = await fetch(`${base}/api/posts/post1/react`, { method: "POST", headers: { "content-type": "application/json", "x-enable-feature": "false" }, body: JSON.stringify({ reactionType: "upvote" }) });
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
