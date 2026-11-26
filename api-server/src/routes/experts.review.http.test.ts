import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ getOne: vi.fn(), updateMatchingIds: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db, SupabaseError: class extends Error { status = 500; } }));
vi.mock("../middleware/auth", () => ({
  requireAuth(req: express.Request, _res: express.Response, next: express.NextFunction) {
    req.auth = { uid: "user-1", authTime: req.header("x-test-stale") ? Math.floor(Date.now() / 1000) - 301 : Math.floor(Date.now() / 1000), email: req.header("x-test-email"), emailVerified: req.header("x-test-verified") === "true" }; next();
  },
  optionalAuth(_req: express.Request, _res: express.Response, next: express.NextFunction) { next(); },
}));
// The module reads the allowlist at import time; this is test-only data.
let server: Server, base: string;
const id = "12345678-1234-1234-1234-123456789abc";
const owner = "00000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  vi.stubEnv("ADMIN_EMAILS", "admin@example.test");
  const { default: router } = await import("./experts");
  const app = express(); app.use(express.json()); app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); vi.unstubAllEnvs(); });
beforeEach(() => { vi.clearAllMocks(); db.isConfigured.mockReturnValue(true); db.updateMatchingIds.mockResolvedValue([id]); db.getOne.mockImplementation(async (table: string) => table === "user_identity_map" ? {supabase_uid: owner} : null); });
async function review(email: string, verified: boolean) {
  return fetch(`${base}/api/experts/${id}/verify`, { method: "POST", headers: { "content-type": "application/json", "x-test-email": email, "x-test-verified": String(verified) }, body: JSON.stringify({ decision: "verified" }) });
}
describe("expert review authorization and conditional transitions with mocked auth and database", () => {
  it("rejects unverified allowlisted email and non-admin identities", async () => {
    expect((await review("admin@example.test", false)).status).toBe(403);
    expect((await review("other@example.test", true)).status).toBe(403);
    expect(db.updateMatchingIds).not.toHaveBeenCalled();
  });
  it("rejects stale reviewer sessions before identity or database reads", async () => {
    const res = await fetch(`${base}/api/experts/${id}/verify`, {method:"POST",headers:{"content-type":"application/json","x-test-email":"admin@example.test","x-test-verified":"true","x-test-stale":"true"},body:JSON.stringify({decision:"verified"})});
    expect(res.status).toBe(403); expect(db.getOne).not.toHaveBeenCalled();expect(db.updateMatchingIds).not.toHaveBeenCalled();
  });
  it("changes only pending applications for a verified allowlisted reviewer", async () => {
    const res = await review("admin@example.test", true); expect(res.status).toBe(200);
    expect(db.updateMatchingIds).toHaveBeenCalledWith("experts", { id, credential_status: "pending_review" }, expect.objectContaining({ credential_status: "verified", is_public: true, reviewed_by: owner }));
  });
  it("does not report success if review lost a race or no application matched", async () => {
    db.updateMatchingIds.mockResolvedValueOnce([]);
    expect((await review("admin@example.test", true)).status).toBe(409);
  });
  it("conditions a submission on owner and draft state and checks the result", async () => {
    db.getOne.mockResolvedValueOnce({supabase_uid:owner}).mockResolvedValueOnce({ user_id: owner, credential_status: "draft" });
    const res = await fetch(`${base}/api/experts/${id}/submit`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(db.updateMatchingIds).toHaveBeenCalledWith("experts", { id, user_id: owner, credential_status: "draft" }, { credential_status: "pending_review" });
  });
  it("rejects a nonowner or a stale submission", async () => {
    db.getOne.mockResolvedValueOnce({supabase_uid:owner}).mockResolvedValueOnce({ user_id: "other", credential_status: "draft" });
    expect((await fetch(`${base}/api/experts/${id}/submit`, { method: "POST" })).status).toBe(403);
    expect(db.updateMatchingIds).not.toHaveBeenCalled();
    db.getOne.mockResolvedValueOnce({supabase_uid:owner}).mockResolvedValueOnce({ user_id: owner, credential_status: "draft" }); db.updateMatchingIds.mockResolvedValueOnce([]);
    expect((await fetch(`${base}/api/experts/${id}/submit`, { method: "POST" })).status).toBe(409);
  });
});
