import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ getOne: vi.fn(), rpc: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db }));
vi.mock("../middleware/auth", () => ({ requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const subject = req.headers.authorization?.replace("Bearer ", "");
  if (!subject) { res.status(401).json({ error: "Authentication required" }); return; }
  req.auth = { uid: subject }; next();
} }));
import router from "./feed-privacy";
const alice = "00000000-0000-4000-8000-000000000001", bob = "00000000-0000-4000-8000-000000000002";
let server: Server, base: string;
beforeAll(async () => { const app = express(); app.use(express.json()); app.use("/api", router); await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); }); const addr = server.address(); if (!addr || typeof addr === "string") throw new Error("No port"); base = `http://127.0.0.1:${addr.port}`; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => {
  vi.resetAllMocks(); db.isConfigured.mockReturnValue(true); db.rpc.mockResolvedValue(undefined);
  db.getOne.mockImplementation(async (table: string, opts: { filters: Record<string, string> }) => {
    if (table === "user_identity_map") return opts.filters.firebase_subject === "eq.alice" ? { supabase_uid: alice } : opts.filters.firebase_subject === "eq.bob" ? { supabase_uid: bob } : null;
    if (table === "server_feature_flags") return { enabled: false };
    return null;
  });
});
async function request(method: string, user?: string, body?: unknown) { const res = await fetch(`${base}/api/feed-privacy`, { method, headers: { ...(user ? {authorization: `Bearer ${user}`} : {}), ...(body === undefined ? {} : {"content-type": "application/json"}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { res, body: res.status === 204 ? null : await res.json() }; }
describe("proposed feed privacy API (mocked auth and storage)", () => {
  it("requires authentication and a mapping before any preference access", async () => { expect((await request("GET")).res.status).toBe(401); expect((await request("GET", "unknown")).res.status).toBe(403); expect(db.rpc).not.toHaveBeenCalled(); expect(db.getOne.mock.calls.every(call => call[0] !== "feed_personalization_preferences")).toBe(true); });
  it("reads only the caller's setting and defaults to off", async () => { const result = await request("GET", "alice"); expect(result.res.status).toBe(200); expect(result.res.headers.get("cache-control")).toBe("no-store"); expect(result.body).toEqual({ enabled: false, scope: "proposed-feed-interests-only" }); expect(db.getOne).toHaveBeenCalledWith("feed_personalization_preferences", expect.objectContaining({ filters: {user_id: `eq.${alice}`} })); });
  it("cannot enable unless the server flag is enabled", async () => { expect((await request("PUT", "alice", {enabled:true})).res.status).toBe(404); expect(db.rpc).not.toHaveBeenCalled(); });
  it("fails closed when the enable switch cannot be read", async () => { db.getOne.mockImplementation(async (table: string) => { if (table === "user_identity_map") return {supabase_uid:alice}; throw new Error("private details"); }); const result = await request("PUT", "alice", {enabled:true}); expect(result.res.status).toBe(503); expect(JSON.stringify(result.body)).not.toContain("private"); expect(db.rpc).not.toHaveBeenCalled(); });
  it("never accepts a caller-chosen identity", async () => { expect((await request("PUT", "bob", {enabled:true, userId:alice})).res.status).toBe(400); expect(db.rpc).not.toHaveBeenCalled(); });
  it("enables only the mapped account when server flag permits it", async () => { db.getOne.mockImplementation(async (table: string) => table === "user_identity_map" ? {supabase_uid:bob} : {enabled:true}); expect((await request("PUT", "bob", {enabled:true})).res.status).toBe(204); expect(db.rpc).toHaveBeenCalledWith("feed_set_personalization", {p_uid:bob,p_enabled:true}); });
  it("allows opt-out and clearing even if the flag is off", async () => { expect((await request("PUT", "alice", {enabled:false})).res.status).toBe(204); expect(db.rpc).toHaveBeenCalledWith("feed_set_personalization", {p_uid:alice,p_enabled:false}); expect((await request("DELETE", "bob")).res.status).toBe(204); expect(db.rpc).toHaveBeenCalledWith("feed_clear_interests", {p_uid:bob}); expect(db.getOne.mock.calls.some(call => call[0] === "server_feature_flags")).toBe(false); });
  it("rejects invalid bodies and hides database errors", async () => { expect((await request("PUT", "alice", {enabled:"false"})).res.status).toBe(400); db.rpc.mockRejectedValueOnce(new Error("sensitive detail")); const result = await request("DELETE", "alice"); expect(result.res.status).toBe(503); expect(JSON.stringify(result.body)).not.toContain("sensitive"); });
});
