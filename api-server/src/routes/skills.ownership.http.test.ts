import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const mock = vi.hoisted(() => ({ insert: vi.fn(), get: vi.fn(), updateMatchingIds: vi.fn(), deleteMatchingIds: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: mock, SupabaseError: class extends Error { constructor(message: string, public status: number, public body?: unknown) { super(message); } } }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../middleware/auth", () => ({
  requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const subject = req.headers.authorization?.replace("Bearer ", "");
    if (!subject) { res.status(401).json({ error: "Authentication required" }); return; }
    req.auth = { uid: subject } as express.Request["auth"]; next();
  },
  optionalAuth(_req: express.Request, _res: express.Response, next: express.NextFunction) { next(); },
}));
import router from "./skills";
import { SupabaseError } from "../lib/supabase";
let server: Server, base: string;
beforeAll(async () => { const app = express(); app.use(express.json()); app.use("/api", router); await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); }); const addr = server.address(); if (!addr || typeof addr === "string") throw new Error("No port"); base = `http://127.0.0.1:${addr.port}`; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => { vi.clearAllMocks(); mock.isConfigured.mockReturnValue(true); mock.insert.mockResolvedValue(undefined); mock.get.mockResolvedValue([]); mock.updateMatchingIds.mockResolvedValue([]); mock.deleteMatchingIds.mockResolvedValue(["skill-1"]); });
const payload = { id: "skill-1", domain: "TEST", title: "Example", status: "private" };
async function put(user: string, body: unknown = payload) { return fetch(`${base}/api/v1/skills`, { method: "PUT", headers: { authorization: `Bearer ${user}`, "content-type": "application/json" }, body: JSON.stringify(body) }); }
describe("skill ownership with mocked service-role database", () => {
  it("inserts a new skill without merge-duplicates", async () => {
    expect((await put("alice")).status).toBe(200);
    expect(mock.insert).toHaveBeenCalledWith("skills", expect.objectContaining({ id: "skill-1", author_id: "alice" }));
    expect(mock.updateMatchingIds).not.toHaveBeenCalled();
  });
  it("allows an existing owner to update using an atomic owner predicate", async () => {
    mock.insert.mockRejectedValueOnce(new SupabaseError("conflict", 409)); mock.updateMatchingIds.mockResolvedValueOnce(["skill-1"]);
    expect((await put("alice")).status).toBe(200);
    expect(mock.updateMatchingIds).toHaveBeenCalledWith("skills", { id: "skill-1", author_id: "alice" }, expect.objectContaining({ author_id: "alice" }));
  });
  it("does not overwrite another user's existing skill", async () => {
    mock.insert.mockRejectedValueOnce(new SupabaseError("conflict", 409)); mock.updateMatchingIds.mockResolvedValueOnce([]);
    const res = await put("bob"); expect(res.status).toBe(403); expect(await res.json()).toEqual({ error: "Skill ownership conflict" });
    expect(mock.updateMatchingIds).toHaveBeenCalledWith("skills", { id: "skill-1", author_id: "bob" }, expect.anything());
  });
  it("does not leak upstream error bodies", async () => {
    mock.insert.mockRejectedValueOnce(new SupabaseError("failed", 500, "sensitive upstream body"));
    const res = await put("alice"); expect(res.status).toBe(502); expect(JSON.stringify(await res.json())).not.toContain("sensitive");
  });
  it("rechecks ownership in delete and never deletes for a nonowner", async () => {
    mock.get.mockResolvedValue([{ id: "skill-1", author_id: "alice" }]);
    expect((await fetch(`${base}/api/v1/skills/skill-1`, { method: "DELETE", headers: { authorization: "Bearer bob" } })).status).toBe(403);
    expect(mock.deleteMatchingIds).not.toHaveBeenCalled();
    expect((await fetch(`${base}/api/v1/skills/skill-1`, { method: "DELETE", headers: { authorization: "Bearer alice" } })).status).toBe(200);
    expect(mock.deleteMatchingIds).toHaveBeenCalledWith("skills", { id: "skill-1", author_id: "alice" });
  });
  it("reports a concurrent delete or ownership change instead of false success", async () => {
    mock.get.mockResolvedValue([{ id: "skill-1", author_id: "alice" }]); mock.deleteMatchingIds.mockResolvedValueOnce([]);
    const res = await fetch(`${base}/api/v1/skills/skill-1`, { method: "DELETE", headers: { authorization: "Bearer alice" } });
    expect(res.status).toBe(409);
  });
  it("rejects filter syntax in the subject or skill identifier", async () => {
    expect((await put("alice,evil")).status).toBe(403);
    expect((await put("alice", { ...payload, id: "bad,id" })).status).toBe(400);
    expect(mock.insert).not.toHaveBeenCalled();
  });
});


describe("public skill list with a mocked service-role database", () => {
  it("requests published rows and excludes any private or review rows returned", async () => {
    mock.get.mockResolvedValueOnce([{ id: "public", status: "published" }, { id: "secret", status: "private" }, { id: "review", status: "in_review" }]);
    const res = await fetch(`${base}/api/v1/skills`);
    expect(res.status).toBe(200);
    expect(mock.get).toHaveBeenCalledWith("skills", expect.objectContaining({ filters: expect.objectContaining({ status: "eq.published" }) }));
    const body = await res.json();
    expect(body.skills).toEqual([{ id: "public", status: "published" }]);
    expect(JSON.stringify(body)).not.toContain("secret");
  });
  it("does not claim a database outage means a migration is missing", async () => {
    mock.get.mockRejectedValueOnce(new Error("upstream outage"));
    const res = await fetch(`${base}/api/v1/skills`);
    expect(res.status).toBe(503); expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toEqual({ error: "Skill storage unavailable" });
  });
});

it("reports unconfigured skill storage rather than an empty successful list", async () => {
  mock.isConfigured.mockReturnValue(false);
  const res = await fetch(`${base}/api/v1/skills`);
  expect(res.status).toBe(503); expect(res.headers.get("cache-control")).toContain("no-store");
  expect(await res.json()).toEqual({ error: "Skill storage unavailable" }); expect(mock.get).not.toHaveBeenCalled();
});
