import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const mock = vi.hoisted(() => ({ getOne: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: mock }));
import router from "./tsrg-status";
let server: Server, base: string;
beforeAll(async () => { const app = express(); app.use("/api", router); await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); }); const addr = server.address(); if (!addr || typeof addr === "string") throw new Error("No port"); base = `http://127.0.0.1:${addr.port}`; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
describe("online TSRG status hard gate", () => {
  it("remains unavailable even when the underlying flag is enabled", async () => {
    mock.getOne.mockResolvedValue({enabled: true});
    const res = await fetch(`${base}/api/tsrg/status`); const body = await res.json();
    expect(res.status).toBe(200); expect(res.headers.get("x-kill-switch-scope")).toBe("online-clients-only"); expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ experimental_feed_available: false, scope: "online-clients-only" });
    expect(Number.isNaN(Date.parse(body.checked_at))).toBe(false);
    expect(mock.getOne).not.toHaveBeenCalled();
  });
});
