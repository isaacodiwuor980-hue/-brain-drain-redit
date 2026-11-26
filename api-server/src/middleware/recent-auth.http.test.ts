import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { requireRecentAuthentication } from "./recent-auth";

let server: Server, base: string;
beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    const value = req.header("x-synthetic-auth-time");
    if (value !== undefined) req.auth = { uid: "synthetic-user", ...(value === "missing" ? {} : { authTime: Number(value) }) };
    next();
  });
  app.post("/sensitive", requireRecentAuthentication, (_req, res) => res.status(204).end());
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
async function request(value?: string) {
  return fetch(`${base}/sensitive`, { method: "POST", headers: value === undefined ? {} : { "x-synthetic-auth-time": value } });
}
describe("recent authentication middleware, synthetic HTTP", () => {
  it("requires an authenticated identity and a recent signed auth time", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect((await request()).status).toBe(401);
    expect((await request("missing")).status).toBe(403);
    expect((await request(String(now - 60))).status).toBe(204);
    expect((await request(String(now - 301))).status).toBe(403);
  });
  it("fails closed for future, invalid and zero times without revealing values", async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const value of ["0", "-1", "NaN", "1.5", String(now + 60)]) {
      const response = await request(value);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Recent sign-in required" });
    }
  });
});
