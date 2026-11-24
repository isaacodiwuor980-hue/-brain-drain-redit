import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const mock = vi.hoisted(() => ({ store: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("../lib/analytics-store", () => ({ storeAnalyticsEvents: mock.store }));
vi.mock("../lib/logger", () => ({ logger: { info: mock.info, error: mock.error } }));
import router from "./events";
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => { vi.resetAllMocks(); mock.store.mockResolvedValue({ storageMode: "memory" }); });

describe("nested telemetry payload safety", () => {
  it("redacts structured values inside arrays and limits strings without losing primitive signals", async () => {
    const event = { id: "synthetic", type: "page_view", sessionId: "session", createdAt: 1, route: "/", payload: { values: ["label", true, 3, null, { query: "synthetic-secret" }, ["nested-secret"], "x".repeat(500)] } };
    const response = await fetch(`${base}/api/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: [event] }) });
    expect(response.status).toBe(202);
    const stored = mock.store.mock.calls[0][0][0];
    expect(stored.payload.values).toEqual(["label", true, 3, null, "[redacted]", "[redacted]", "x".repeat(160)]);
    expect(JSON.stringify(stored)).not.toContain("synthetic-secret");
    expect(JSON.stringify(stored)).not.toContain("nested-secret");
  });
});
