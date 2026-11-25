import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({isConfigured: vi.fn(() => true), getOne: vi.fn(), get: vi.fn(), insert: vi.fn(), delete: vi.fn(), rpc: vi.fn()}));
vi.mock("../lib/supabase", () => ({supabase: db, SupabaseError: class extends Error {}}));
vi.mock("../middleware/auth", () => ({requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.header("authorization")) {res.status(401).json({error: "Authentication required"}); return;}
  req.auth = {uid: "synthetic", authTime: Number(req.header("x-synthetic-time"))}; next();
}}));
import router from "./posts";
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/api", router);
  await new Promise<void>(resolve => {server = app.listen(0, "127.0.0.1", resolve);});
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No port"); base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
beforeEach(() => {vi.resetAllMocks(); db.isConfigured.mockReturnValue(true); db.getOne.mockResolvedValue({id: "post-1"}); db.get.mockResolvedValue([]);});
async function vote(auth: boolean, authTime = Math.floor(Date.now() / 1000), reactionType = "upvote") {
  return fetch(`${base}/api/posts/post-1/react`, {method: "POST", headers: {"content-type": "application/json", ...(auth ? {authorization: "Bearer synthetic", "x-synthetic-time": String(authTime)} : {}), "x-enable-feature": "true"}, body: JSON.stringify({reactionType})});
}
describe("legacy reaction endpoint safety gate (mocked DB)", () => {
  it("denies unauthenticated requests", async () => {expect((await vote(false)).status).toBe(401); expect(db.insert).not.toHaveBeenCalled();});
  it("does not perform unversioned writes even for fresh sessions or forged enable headers", async () => {
    const result = await vote(true); expect(result.status).toBe(503); expect(await result.json()).toEqual({error: "Voting temporarily unavailable"});
    expect(db.get).not.toHaveBeenCalled(); expect(db.getOne).not.toHaveBeenCalled(); expect(db.insert).not.toHaveBeenCalled(); expect(db.delete).not.toHaveBeenCalled(); expect(db.rpc).not.toHaveBeenCalled();
  });
  it.each(["upvote", "downvote", "repost", "unknown"])("fails closed for %s independently of request body", async (reactionType) => {
    const response = await vote(true, Math.floor(Date.now() / 1000), reactionType);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(db.get).not.toHaveBeenCalled(); expect(db.getOne).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled(); expect(db.delete).not.toHaveBeenCalled(); expect(db.rpc).not.toHaveBeenCalled();
  });
  it("does not perform unversioned writes for stale sessions or retries", async () => {
    for (let i = 0; i < 2; i++) expect((await vote(true, Math.floor(Date.now() / 1000) - 301)).status).toBe(503);
    expect(db.insert).not.toHaveBeenCalled(); expect(db.delete).not.toHaveBeenCalled();
  });
});
