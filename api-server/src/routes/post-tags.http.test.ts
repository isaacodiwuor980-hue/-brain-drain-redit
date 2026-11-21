import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ insert: vi.fn(), get: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db, SupabaseError: class extends Error { status = 500; } }));
vi.mock("../middleware/auth", () => ({
  requireAuth(req: express.Request, _res: express.Response, next: express.NextFunction) { req.auth = { uid: "author" }; next(); },
  optionalAuth(_req: express.Request, _res: express.Response, next: express.NextFunction) { next(); },
}));
import posts from "./posts";
import feed from "./feed";
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/api", posts, feed);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No port"); base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => { vi.clearAllMocks(); db.isConfigured.mockReturnValue(true); });
const input = { id: "tagged-post", topicId: "coding", content: "example", tags: [" Coding ", "TypeScript"] };
async function create(body: unknown) { return fetch(`${base}/api/posts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
describe("post tags round trip with mocked storage", () => {
  it("validates, stores, returns and reads tags in a feed", async () => {
    let stored: Record<string, unknown> = {};
    db.insert.mockImplementationOnce(async (_table, row) => { stored = row; });
    const created = await create(input); expect(created.status).toBe(201);
    expect((await created.json()).post.tags).toEqual(["Coding", "TypeScript"]);
    expect(stored.tags).toEqual(["Coding", "TypeScript"]);
    db.get.mockImplementation(async (table: string) => table === "posts" ? [{ ...stored, repost_count: 0, comment_count: 0, topic: null, author: null }] : []);
    const response = await fetch(`${base}/api/feed?topic=tag-round-trip`); expect(response.status).toBe(200);
    expect((await response.json()).posts[0].tags).toEqual(["Coding", "TypeScript"]);
    expect(db.get).toHaveBeenCalledWith("posts", expect.objectContaining({ select: expect.stringContaining("tags") }));
  });
  it.each([[" ", "valid"], ["a".repeat(41)], Array.from({ length: 11 }, () => "tag")])("rejects invalid tag lists", async (tags) => {
    expect((await create({ ...input, tags })).status).toBe(400); expect(db.insert).not.toHaveBeenCalled();
  });
  it("keeps old clients without tags compatible", async () => {
    db.insert.mockResolvedValueOnce(undefined);
    const { tags: _tags, ...oldClient } = input; const res = await create(oldClient);
    expect(res.status).toBe(201); expect((await res.json()).post.tags).toEqual([]);
  });
});
