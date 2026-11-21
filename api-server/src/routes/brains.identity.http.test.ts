import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ getOne: vi.fn(), get: vi.fn(), rpc: vi.fn(), delete: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db, SupabaseError: class extends Error { constructor(message: string, public status: number, public body?: unknown) { super(message); } } }));
vi.mock("../middleware/auth", () => ({
  requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const subject = req.headers.authorization?.replace("Bearer ", "");
    if (!subject) { res.status(401).json({ error: "Authentication required" }); return; }
    req.auth = { uid: subject } as express.Request["auth"]; next();
  },
  optionalAuth(req: express.Request, _res: express.Response, next: express.NextFunction) {
    const subject = req.headers.authorization?.replace("Bearer ", "");
    if (subject) req.auth = { uid: subject } as express.Request["auth"];
    next();
  },
}));
import router from "./brains";
const a = "00000000-0000-4000-8000-000000000001", b = "00000000-0000-4000-8000-000000000002";
const brain = { id: "brain1", author_id: a, title: "Private", category: "", description: "", root_node_id: null, is_public: false, is_favorite: false, repo_status: null, active_branch: null, created_at: "2025-01-01T00:00:00Z" };
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const addr = server.address(); if (!addr || typeof addr === "string") throw new Error("No port"); base = `http://127.0.0.1:${addr.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => {
  vi.clearAllMocks(); db.isConfigured.mockReturnValue(true);
  db.getOne.mockImplementation(async (table: string, options: { filters: Record<string, string> }) => {
    if (table === "user_identity_map") {
      if (options.filters.firebase_subject === "eq.alice") return { supabase_uid: a };
      if (options.filters.firebase_subject === "eq.bob") return { supabase_uid: b };
      if (options.filters.firebase_subject === "eq.unavailable") throw new Error("db");
      return null;
    }
    if (table === "brains") return brain;
    return null;
  });
  db.get.mockResolvedValue([]); db.delete.mockResolvedValue(undefined);
  db.rpc.mockResolvedValue({ created: true, nodeCount: 0, brain });
});
const auth = (user: string) => ({ authorization: `Bearer ${user}` });
async function save(user: string) { return fetch(`${base}/api/brains`, { method: "POST", headers: { ...auth(user), "content-type": "application/json" }, body: JSON.stringify({ brain: { id: "brain1", title: "Private" }, nodes: [] }) }); }
describe("brain routes with mocked identity and database", () => {
  it("uses mapped UUID for save and never the raw Firebase subject", async () => {
    expect((await save("alice")).status).toBe(201);
    expect(db.rpc).toHaveBeenCalledWith("save_brain_atomic", expect.objectContaining({ p_uid: a }));
  });
  it("does not write for unmapped users or lookup failure", async () => {
    expect((await save("unknown")).status).toBe(403);
    expect((await save("unavailable")).status).toBe(503);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("scopes private list to the mapped UUID", async () => {
    const response = await fetch(`${base}/api/brains?mine=true`, { headers: auth("alice") });
    expect(response.status).toBe(200);
    expect(db.get).toHaveBeenCalledWith("brains", expect.objectContaining({ filters: { author_id: `eq.${a}` } }));
    expect((await fetch(`${base}/api/brains?mine=true`, { headers: auth("unknown") })).status).toBe(403);
  });
  it("allows owner private read and blocks another user and guest", async () => {
    expect((await fetch(`${base}/api/brains/brain1`, { headers: auth("alice") })).status).toBe(200);
    expect((await fetch(`${base}/api/brains/brain1`, { headers: auth("bob") })).status).toBe(404);
    expect((await fetch(`${base}/api/brains/brain1`)).status).toBe(404);
  });
  it("keeps public reads available without a mapping", async () => {
    db.getOne.mockResolvedValueOnce({ ...brain, is_public: true });
    expect((await fetch(`${base}/api/brains/brain1`)).status).toBe(200);
    expect(db.getOne).toHaveBeenCalledTimes(1);
  });
  it("only deletes for mapped owner and scopes the write", async () => {
    expect((await fetch(`${base}/api/brains/brain1`, { method: "DELETE", headers: auth("bob") })).status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
    expect((await fetch(`${base}/api/brains/brain1`, { method: "DELETE", headers: auth("alice") })).status).toBe(204);
    expect(db.delete).toHaveBeenCalledWith("brains", { id: "brain1", author_id: a });
  });
});
