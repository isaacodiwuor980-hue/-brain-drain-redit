import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ get: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
import router from "./search";
let server: Server, base: string;
beforeAll(async () => { const app = express(); app.use("/api", router); await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); }); const addr = server.address(); if (!addr || typeof addr === "string") throw new Error("No port"); base = `http://127.0.0.1:${addr.port}`; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => { vi.clearAllMocks(); db.isConfigured.mockReturnValue(true); });
const row = (id: string, status: string) => ({ id, status, title: id, domain: "EXAMPLE", make: null, model: null, year: null, part: null, version: "1", author_name: "Example", author_years_experience: null, source_brain_id: null });
describe("public skill search privacy with database mocks", () => {
  it.each(["rule_only", "rule_keyword", "all"])("requests only published records in %s mode and excludes non-published results", async (layers) => {
    // Deliberately return rows that violate the requested filter as defense-in-depth.
    db.get.mockResolvedValue([row("public", "published"), row("secret", "private"), row("review", "in_review")]);
    const res = await fetch(`${base}/api/v1/search/skills?q=example&layers=${layers}`);
    expect(res.status).toBe(200); const body = await res.json();
    expect(db.get).toHaveBeenCalledWith("skills", expect.objectContaining({ filters: expect.objectContaining({ status: "eq.published" }) }));
    expect(body.results.map((item: { recordId: string }) => item.recordId)).toEqual(["public"]);
    expect(JSON.stringify(body)).not.toContain("secret"); expect(JSON.stringify(body)).not.toContain("review");
  });
});

it("does not advise applying an unreviewed migration when search storage fails", async () => {
  db.get.mockRejectedValueOnce(new Error("upstream outage"));
  const res = await fetch(`${base}/api/v1/search/skills?q=example`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.note).toBe("Skill search is temporarily unavailable.");
  expect(JSON.stringify(body)).not.toContain("0002_search.sql");
});
