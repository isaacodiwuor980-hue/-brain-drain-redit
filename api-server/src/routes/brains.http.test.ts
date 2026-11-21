import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), getOne: vi.fn(), configured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({
  SupabaseError: class SupabaseError extends Error {
    constructor(message: string, public status: number, public body?: unknown) { super(message); }
  },
  supabase: { rpc: mock.rpc, getOne: mock.getOne, isConfigured: mock.configured },
}));
vi.mock("../middleware/auth", () => ({
  requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!req.headers.authorization) { res.status(401).json({ error: "Authentication required" }); return; }
    req.auth = { uid: "user-1" } as express.Request["auth"];
    next();
  },
  optionalAuth(_req: express.Request, _res: express.Response, next: express.NextFunction) { next(); },
}));
import router from "./brains";
import { SupabaseError } from "../lib/supabase";

let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())); });
beforeEach(() => { mock.rpc.mockReset(); mock.getOne.mockReset(); mock.getOne.mockResolvedValue({ supabase_uid: "00000000-0000-4000-8000-000000000001" }); mock.configured.mockReturnValue(true); });

const payload = { brain: { id: "b1", title: "Example" }, nodes: [] };
async function post(body: unknown, authenticated = true) {
  return fetch(`${base}/api/brains`, { method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { authorization: "Bearer test" } : {}) }, body: JSON.stringify(body) });
}

describe("brain save API with isolated auth/database mocks", () => {
  it("rejects unauthenticated and invalid requests before database access", async () => {
    expect((await post(payload, false)).status).toBe(401);
    expect((await post({ brain: { id: "bad id", title: "x" }, nodes: [] })).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("sends the verified mapped UUID and payload to the atomic database function", async () => {
    mock.rpc.mockResolvedValue({ created: true, nodeCount: 0, brain: { id: "b1", author_id: "00000000-0000-4000-8000-000000000001", title: "Example", category: "", description: "", root_node_id: null, is_public: false, is_favorite: false, repo_status: null, active_branch: null, created_at: "2025-01-01T00:00:00Z" } });
    const response = await post(payload);
    expect(response.status).toBe(201);
    expect(mock.rpc).toHaveBeenCalledWith("save_brain_atomic", expect.objectContaining({ p_uid: "00000000-0000-4000-8000-000000000001", p_nodes: [] }));
    expect(await response.json()).toMatchObject({ nodeCount: 0, brain: { id: "b1", created_at: 1735689600000 } });
  });
  it("fails closed on ownership conflicts and unavailable migrations", async () => {
    mock.rpc.mockRejectedValueOnce(new SupabaseError("conflict", 403, JSON.stringify({ code: "42501" })));
    expect((await post(payload)).status).toBe(403);
    mock.rpc.mockRejectedValueOnce(new SupabaseError("missing function", 404, JSON.stringify({ code: "PGRST202" })));
    expect((await post(payload)).status).toBe(502);
    expect(mock.rpc).toHaveBeenCalledTimes(2);
  });
});
