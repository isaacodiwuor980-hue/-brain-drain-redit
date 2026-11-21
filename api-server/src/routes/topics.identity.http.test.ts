import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ insert: vi.fn(), getOne: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db, SupabaseError: class extends Error {} }));
vi.mock("../middleware/auth", () => ({ requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const subject = req.headers.authorization?.replace("Bearer ", "");
  if (!subject) { res.status(401).json({ error: "Authentication required" }); return; }
  req.auth = { uid: subject }; next();
} }));
import router from "./topics";
const a = "00000000-0000-4000-8000-000000000001", b = "00000000-0000-4000-8000-000000000002";
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const addr = server.address(); if (!addr || typeof addr === "string") throw new Error("No port"); base = `http://127.0.0.1:${addr.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => {
  vi.clearAllMocks(); db.isConfigured.mockReturnValue(true); db.insert.mockResolvedValue(undefined);
  db.getOne.mockImplementation(async (_table: string, opts: { filters: Record<string, string> }) => {
    if (opts.filters.firebase_subject === "eq.alice") return { supabase_uid: a };
    if (opts.filters.firebase_subject === "eq.bob") return { supabase_uid: b };
    return null;
  });
});
async function follow(user: string, userId?: string) { return fetch(`${base}/api/topics/follow`, { method: "POST", headers: { authorization: `Bearer ${user}`, "content-type": "application/json" }, body: JSON.stringify({ topicId: "coding", userId }) }); }
describe("topic follow mapped identity (mocked auth and storage)", () => {
  it("writes the mapped UUID", async () => {
    expect((await follow("alice")).status).toBe(204);
    expect(db.insert).toHaveBeenCalledWith("topic_followers", { topic_id: "coding", user_id: a }, "resolution=merge-duplicates");
  });
  it("rejects unmapped subjects before writing", async () => {
    const response = await follow("unknown");
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: "Identity mapping required" });
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("does not let a caller follow on behalf of another account", async () => {
    expect((await follow("bob", a)).status).toBe(204);
    expect(db.insert).toHaveBeenCalledWith("topic_followers", { topic_id: "coding", user_id: b }, "resolution=merge-duplicates");
  });
  it("fails closed on lookup errors", async () => {
    db.getOne.mockRejectedValueOnce(new Error("upstream"));
    expect((await follow("alice")).status).toBe(503); expect(db.insert).not.toHaveBeenCalled();
  });
});
