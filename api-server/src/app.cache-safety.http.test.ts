import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
vi.mock("./lib/config", () => ({ config: { trustProxy: "false", corsOrigins: [], bodyLimit: "256kb", rateLimit: { windowMs: 60000, max: 60 }, redis: { url: "" } } }));
vi.mock("./lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("pino-http", () => ({ default: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("./routes", async () => {
  const { Router } = await import("express");
  const router = Router(); router.get("/feed", (_req, res) => res.json({ posts: [] }));
  router.get("/search", (_req, res) => res.json({ results: [] }));
  return { default: router };
});
import app from "./app";
let server: Server, base: string;
beforeAll(async () => { await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); }); const addr = server.address(); if (!addr || typeof addr === "string") throw new Error("No port"); base = `http://127.0.0.1:${addr.port}`; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
describe("personalized feed browser-cache safety", () => {
  it.each(["foryou", "following"])("sends no-store for %s", async (mode) => {
    const res = await fetch(`${base}/api/feed?mode=${mode}`);
    expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toBe("no-store");
  });
});


it("counts each search request once against the general read budget", async () => {
  for (let i = 0; i < 150; i++) {
    const response = await fetch(`${base}/api/search`);
    expect(response.status).toBe(200);
  }
});
