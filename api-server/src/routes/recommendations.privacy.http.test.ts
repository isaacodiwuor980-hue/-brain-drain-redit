import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const mock = vi.hoisted(() => ({
  getAnalyticsSummary: vi.fn(() => ({ storageMode: "memory", byType: { search_submitted: 1 } })),
  getRecentAnalyticsEvents: vi.fn(() => [{ type: "brain_launch", createdAt: Date.now(), payload: { brainId: "synthetic-private-brain" } }]),
}));
vi.mock("../lib/analytics-store", () => mock);
import router from "./recommendations";
let server: Server, base: string;
beforeAll(async () => {
  const app = express(); app.use("/api", router);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });

describe("legacy global brain recommendations privacy", () => {
  it("does not disclose private identifiers or cross-user activity to anonymous requests", async () => {
    const response = await fetch(`${base}/api/recommendations/brains`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.recommendations).toEqual([]);
    expect(body.signalSummary).toEqual({ directBrainSignals: 0, launchSignals: 0, searchSignals: 0, postSignals: 0 });
    expect(JSON.stringify(body)).not.toContain("synthetic-private-brain");
    expect(mock.getRecentAnalyticsEvents).not.toHaveBeenCalled();
    expect(mock.getAnalyticsSummary).not.toHaveBeenCalled();
  });
});
