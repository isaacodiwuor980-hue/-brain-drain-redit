import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import router from "./data-api";
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
describe("dataset metadata", () => {
  it("marks each conceptual dataset and licensing unavailable", async () => {
    const res = await fetch(`${base}/api/v1/datasets`); const body = await res.json();
    expect(res.status).toBe(200); expect(body.status).toBe("not yet available");
    expect(body.datasets).toHaveLength(3);
    for (const item of body.datasets) { expect(item.status).toBe("not yet available"); expect(item.license).toBe("not established"); expect(item.recordCount).toBe("not available"); }
    expect(body.licensing.status).toBe("not yet available");
    expect(JSON.stringify(body)).not.toMatch(/never stored raw|100 API calls|Each entry has a SHA-256/i);
  });
});
