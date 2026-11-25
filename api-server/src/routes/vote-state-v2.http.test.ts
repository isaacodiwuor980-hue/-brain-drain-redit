import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ isConfigured: vi.fn(() => true), getOne: vi.fn(), rpc: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabase: db }));
vi.mock("../middleware/auth", () => ({
  requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const uid = req.header("x-synthetic-user");
    if (!uid) { res.status(401).json({ error: "Authentication required" }); return; }
    req.auth = { uid }; next();
  },
}));
import router from "./vote-state-v2";
const alice = "00000000-0000-4000-8000-000000000001";
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
beforeEach(() => {
  vi.resetAllMocks(); db.isConfigured.mockReturnValue(true);
  db.getOne.mockImplementation(async (table: string, opts: { filters: Record<string, string> }) =>
    table === "server_feature_flags" ? {enabled: true} : opts.filters.firebase_subject === "eq.alice" ? {supabase_uid: alice} : null);
  db.rpc.mockResolvedValue({vote: "upvote", revision: 3});
});
async function get(user?: string, id = "post-1") {
  const response = await fetch(`${base}/api/posts/${encodeURIComponent(id)}/vote-state-v2`, { headers: user ? {"x-synthetic-user": user} : {} });
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
  it("only requests caller's mapped state and returns an allowlisted response without counts or other identities", async () => {
    db.rpc.mockResolvedValueOnce({vote: "upvote", revision: 3, total: 99, otherUser: "synthetic-secret"});
    const {response, body} = await get("alice");
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({vote: "upvote", revision: 3});
    expect(db.rpc).toHaveBeenCalledWith("experimental_get_own_vote_v2", {p_uid: alice, p_post_id: "post-1"});
  });
  it("rejects unsafe ids and invalid/unavailable results without leaking details", async () => {
    expect((await get("alice", "a),bad")).response.status).toBe(400); expect(db.rpc).not.toHaveBeenCalled();
    for (const invalid of [{vote: "both", revision: 1}, {vote: null, revision: -1}, {vote: null, revision: "1"}, null]) {
      db.rpc.mockResolvedValueOnce(invalid); const result = await get("alice");
      expect(result.response.status).toBe(503); expect(result.body).toEqual({error: "Vote status unavailable"});
    }
    db.rpc.mockRejectedValueOnce(new Error("synthetic-private-details"));
    const result = await get("alice"); expect(result.response.status).toBe(503); expect(JSON.stringify(result.body)).not.toContain("synthetic-private-details");
  });
});
