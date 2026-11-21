import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ insert: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db, SupabaseError: class extends Error { constructor(message: string, public status: number, public body?: unknown) { super(message); } } }));
vi.mock("../middleware/auth", () => ({ requireAuth(req: express.Request, _res: express.Response, next: express.NextFunction) { req.auth = { uid: "user1" } as express.Request["auth"]; next(); } }));
import router from "./topics";
import { SupabaseError } from "../lib/supabase";
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => { vi.clearAllMocks(); db.isConfigured.mockReturnValue(true); db.insert.mockResolvedValue(undefined); });
async function create() { return fetch(`${base}/api/topics`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "coding", name: "Coding", description: "example" }) }); }
describe("topic creation service-role safety with mocked database", () => {
  it("inserts a new topic without merge-duplicates", async () => {
    const res = await create(); expect(res.status).toBe(201);
    expect(db.insert).toHaveBeenCalledWith("topics", { id: "coding", name: "Coding", description: "example", category: null });
  });
  it("reports a conflict instead of overwriting an existing topic", async () => {
    db.insert.mockRejectedValueOnce(new SupabaseError("conflict", 409, "sensitive details"));
    const res = await create(); expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain("sensitive");
    expect(db.insert).toHaveBeenCalledOnce();
    expect(db.insert.mock.calls[0]).toHaveLength(2);
  });
  it("does not expose upstream failure details", async () => {
    db.insert.mockRejectedValueOnce(new SupabaseError("failure", 500, "sensitive details"));
    const res = await create(); expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("sensitive");
  });
});
