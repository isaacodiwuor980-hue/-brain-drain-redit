import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const mock = vi.hoisted(() => ({ getOne: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: mock }));
vi.mock("../middleware/auth", () => ({
  requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!req.headers.authorization) { res.status(401).json({ error: "Authentication required" }); return; }
    req.auth = { uid: "firebase-user" } as express.Request["auth"]; next();
  },
}));
import router from "./me";
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => { vi.clearAllMocks(); mock.isConfigured.mockReturnValue(true); });
describe("GET /api/me with isolated auth and database mocks", () => {
  it("returns only the caller's mapped UUID with no-store", async () => {
    mock.getOne.mockResolvedValue({ supabase_uid: "00000000-0000-4000-8000-000000000001" });
    const res = await fetch(`${base}/api/me`, { headers: { authorization: "Bearer mock" } });
    expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ uid: "00000000-0000-4000-8000-000000000001", mapped: true });
    expect(mock.getOne).toHaveBeenCalledWith("user_identity_map", expect.objectContaining({ filters: { firebase_subject: "eq.firebase-user" } }));
  });
  it("rejects an authenticated but unmapped caller with 401", async () => {
    mock.getOne.mockResolvedValue(null);
    const res = await fetch(`${base}/api/me`, { headers: { authorization: "Bearer mock" } });
    expect(res.status).toBe(401); expect(await res.json()).toEqual({ error: "Identity mapping required" });
  });
  it("rejects missing authentication and fails closed on database errors", async () => {
    expect((await fetch(`${base}/api/me`)).status).toBe(401);
    mock.getOne.mockRejectedValue(new Error("down"));
    const res = await fetch(`${base}/api/me`, { headers: { authorization: "Bearer mock" } });
    expect(res.status).toBe(503); expect(await res.json()).toEqual({ error: "Identity service unavailable" });
  });
});
