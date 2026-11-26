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

describe("paused legacy brain save API with isolated database mocks", () => {
  it("rejects full-snapshot writes regardless of authentication or payload", async () => {
    for (const [body, authenticated] of [[payload, true], [payload, false], [{ brain: { id: "bad id" }, nodes: [] }, true]] as const) {
      const response = await post(body, authenticated);
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toEqual({ error: "Cloud brain saving temporarily unavailable" });
    }
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.getOne).not.toHaveBeenCalled();
  });
});
