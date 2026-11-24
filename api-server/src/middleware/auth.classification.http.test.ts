import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
vi.mock("../lib/config", () => ({ config: { firebase: { projectId: "synthetic-project" } } }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
import { requireAuth } from "./auth";
let server: Server, base: string;
const nativeFetch = globalThis.fetch;
const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
beforeAll(async () => {
  const app = express(); app.get("/private", requireAuth, (_req,res) => res.sendStatus(204));
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { vi.unstubAllGlobals(); await new Promise<void>((resolve,reject) => server.close(err => err ? reject(err) : resolve())); });
async function request(kid: string) {
  const token = `${part({ alg:"RS256", kid })}.${part({})}.AA`;
  return nativeFetch(`${base}/private`, { headers: { authorization: `Bearer ${token}` } });
}
describe("Firebase authentication error classification", () => {
  it("treats an unknown attacker-controlled key ID as invalid authentication, not an upstream outage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [] }), {status: 200})));
    expect((await request("synthetic-network" )).status).toBe(401);
  });
  it("keeps a genuine upstream failure retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket closed")));
    expect((await request("synthetic-other" )).status).toBe(502);
  });
});
