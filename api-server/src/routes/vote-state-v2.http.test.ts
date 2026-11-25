import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ isConfigured: vi.fn(() => true), getOne: vi.fn(), rpc: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabase: db }));
vi.mock("../middleware/auth", () => ({
  requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const uid = req.header("x-synthetic-user");
    if (!uid) { res.status(401).json({ error: "Authentication required" }); return; }
    req.auth = { uid, authTime: req.header("x-synthetic-stale") ? Math.floor(Date.now() / 1000) - 301 : Math.floor(Date.now() / 1000) }; next();
  },
}));
import router, { voteStateReadAdapterForTests } from "./vote-state-v2";
import { requireAuth } from "../middleware/auth";
import { requireRecentAuthentication } from "../middleware/recent-auth";
import { requireMappedIdentity } from "../middleware/identity-map";
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use("/api", router);
  // Exercise the unmounted adapter solely in this synthetic fixture.
  app.get("/fixture/posts/:id/vote-state-v2", (_req, res, next) => {res.setHeader("Cache-Control", "no-store"); next();}, requireAuth, requireRecentAuthentication, requireMappedIdentity, voteStateReadAdapterForTests);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
beforeEach(() => {
  vi.resetAllMocks(); db.isConfigured.mockReturnValue(true);
  db.getOne.mockImplementation(async (table: string, opts: { filters: Record<string, string> }) =>
    table === "server_feature_flags" ? {enabled: true} : opts.filters.firebase_subject === "eq.alice" ? {supabase_uid: alice} : opts.filters.firebase_subject === "eq.bob" ? {supabase_uid: bob} : null);
  db.rpc.mockResolvedValue({vote: "upvote", revision: 3});
});
async function get(user?: string, id = "post-1", stale = false, fixture = false) {
  const response = await fetch(`${base}/${fixture ? "fixture" : "api"}/posts/${encodeURIComponent(id)}/vote-state-v2`, { headers: user ? {"x-synthetic-user": user, ...(stale ? {"x-synthetic-stale": "true"} : {})} : {} });
  return {response, body: await response.json()};
}
describe("own vote-state v2 (mocked HTTP, default off)", () => {
  it("is unavailable when the server flag is off", async () => {
    db.getOne.mockResolvedValueOnce(null);
    const {response} = await get("alice"); expect(response.status).toBe(404); expect(db.rpc).not.toHaveBeenCalled();
  });
  it("requires authenticated and mapped identity", async () => {
    expect((await get()).response.status).toBe(401);
    expect((await get("unknown")).response.status).toBe(403);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("rejects stale sessions before reading any vote", async () => {
    const result = await get("alice", "post-1", true);
    expect(result.response.status).toBe(403);
    expect(result.body).toEqual({error: "Recent sign-in required"});
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("remains unavailable even if its server flag is enabled until a secure RPC is implemented", async () => {
    const result = await get("alice");
    expect(result.response.status).toBe(503);
    expect(result.body).toEqual({error: "Vote status unavailable"});
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("only requests caller's mapped state and returns an allowlisted response without counts or other identities", async () => {
    db.rpc.mockResolvedValueOnce({vote: "upvote", revision: 3, total: 99, otherUser: "synthetic-secret"});
    const {response, body} = await get("alice", "post-1", false, true);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({vote: "upvote", revision: 3});
    expect(db.rpc).toHaveBeenCalledWith("experimental_get_own_vote_v2", {p_uid: alice, p_post_id: "post-1"});
  });
  it("maps each request independently across devices and account switches", async () => {
    db.rpc.mockResolvedValueOnce({vote: "upvote", revision: 2}).mockResolvedValueOnce({vote: null, revision: 0}).mockResolvedValueOnce({vote: "upvote", revision: 2});
    const a1 = await get("alice", "post-1", false, true);
    const b = await get("bob", "post-1", false, true);
    const a2 = await get("alice", "post-1", false, true);
    expect(a1.body).toEqual({vote: "upvote", revision: 2});
    expect(b.body).toEqual({vote: null, revision: 0});
    expect(a2.body).toEqual(a1.body);
    expect(db.rpc.mock.calls.map(call => call[1].p_uid)).toEqual([alice, bob, alice]);
  });
  it("rejects unsafe ids and invalid/unavailable results without leaking details", async () => {
    expect((await get("alice", "a),bad", false, true)).response.status).toBe(400); expect(db.rpc).not.toHaveBeenCalled();
    for (const invalid of [{vote: "both", revision: 1}, {vote: null, revision: -1}, {vote: null, revision: "1"}, null]) {
      db.rpc.mockResolvedValueOnce(invalid); const result = await get("alice", "post-1", false, true);
      expect(result.response.status).toBe(503); expect(result.body).toEqual({error: "Vote status unavailable"});
    }
    db.rpc.mockRejectedValueOnce(new Error("synthetic-private-details"));
    const result = await get("alice", "post-1", false, true); expect(result.response.status).toBe(503); expect(JSON.stringify(result.body)).not.toContain("synthetic-private-details");
  });
});
