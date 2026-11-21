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
import router from "./personality";
const a = "00000000-0000-4000-8000-000000000001", b = "00000000-0000-4000-8000-000000000002";
let server: Server, base: string;
beforeAll(async () => { const app = express(); app.use(express.json()); app.use("/api", router); await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); }); const addr = server.address(); if (!addr || typeof addr === "string") throw new Error("No port"); base = `http://127.0.0.1:${addr.port}`; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => {
  vi.clearAllMocks(); db.isConfigured.mockReturnValue(true); db.insert.mockResolvedValue(undefined);
  db.getOne.mockImplementation(async (table: string, opts: { filters: Record<string, string> }) => {
    if (table === "user_identity_map") return opts.filters.firebase_subject === "eq.alice" ? { supabase_uid: a } : opts.filters.firebase_subject === "eq.bob" ? { supabase_uid: b } : null;
    if (table === "personality_results" && opts.filters.user_id === `eq.${a}`) return { id: "a-result", extraversion: "3", agreeableness: "3", conscientiousness: "3", neuroticism: "3", openness: "3", test_version: "bfi-10", created_at: "2025-01-01" };
    return null;
  });
});
const headers = (user: string) => ({ authorization: `Bearer ${user}`, "content-type": "application/json" });
const responses = { e1: 3, e2r: 3, a1: 3, a2r: 3, c1: 3, c2r: 3, n1: 3, n2r: 3, o1: 3, o2r: 3 };
describe("personality mapped identity (mocked auth and storage)", () => {
  it("stores results for the mapped user", async () => {
    expect((await fetch(`${base}/api/personality/submit`, { method: "POST", headers: headers("alice"), body: JSON.stringify({ responses, userId: b }) })).status).toBe(200);
    expect(db.insert).toHaveBeenCalledWith("personality_results", expect.objectContaining({ user_id: a }));
  });
  it("rejects unmapped users without reading or writing results", async () => {
    for (const [path, method] of [["/personality", "GET"], ["/personality/submit", "POST"]] as const) {
      const r = await fetch(`${base}/api${path}`, { method, headers: headers("unknown"), ...(method === "POST" ? { body: JSON.stringify({ responses }) } : {}) });
      expect(r.status).toBe(403); expect(await r.json()).toEqual({ error: "Identity mapping required" });
    }
    expect(db.insert).not.toHaveBeenCalled(); expect(db.getOne.mock.calls.every(c => c[0] === "user_identity_map")).toBe(true);
  });
  it("scopes each result read to the caller and does not expose another user", async () => {
    const own = await fetch(`${base}/api/personality`, { headers: headers("alice") }); expect((await own.json()).id).toBe("a-result");
    const other = await fetch(`${base}/api/personality?userId=${a}`, { headers: headers("bob") }); expect(await other.json()).toBeNull();
    expect(db.getOne).toHaveBeenCalledWith("personality_results", expect.objectContaining({ filters: { user_id: `eq.${b}` } }));
  });
});
