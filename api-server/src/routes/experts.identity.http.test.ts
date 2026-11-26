import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const db = vi.hoisted(() => ({ getOne: vi.fn(), insert: vi.fn(), updateMatchingIds: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: db, SupabaseError: class extends Error {} }));
vi.mock("../middleware/auth", () => ({
  requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const uid = req.header("x-synthetic-user");
    if (!uid) { res.status(401).json({error:"Authentication required"}); return; }
    req.auth = {uid, authTime: Math.floor(Date.now()/1000)}; next();
  },
  optionalAuth(_req: express.Request, _res: express.Response, next: express.NextFunction) { next(); },
}));
import router from "./experts";
const a = "00000000-0000-4000-8000-000000000001", b = "00000000-0000-4000-8000-000000000002";
const id = "12345678-1234-1234-1234-123456789abc";
let server: Server, base: string;
beforeAll(async () => { const app = express(); app.use(express.json()); app.use("/api", router); await new Promise<void>(resolve => {server=app.listen(0,"127.0.0.1",resolve);}); const address=server.address(); if(!address || typeof address === "string") throw new Error("No port"); base=`http://127.0.0.1:${address.port}`; });
afterAll(async () => { await new Promise<void>((resolve,reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => {
  vi.resetAllMocks(); db.isConfigured.mockReturnValue(true); db.insert.mockResolvedValue(undefined); db.updateMatchingIds.mockResolvedValue([id]);
  db.getOne.mockImplementation(async (table:string, opts:{filters:Record<string,string>}) => {
    if (table === "user_identity_map") {
      if (opts.filters.firebase_subject === "eq.unavailable") throw new Error("synthetic secret");
      return opts.filters.firebase_subject === "eq.alice" ? {supabase_uid:a} : opts.filters.firebase_subject === "eq.bob" ? {supabase_uid:b} : null;
    }
    return null;
  });
});
async function request(path:string, user:string, body?:unknown) { return fetch(`${base}/api${path}`, {method:body === undefined ? "GET" : "POST",headers:{"x-synthetic-user":user,"content-type":"application/json"},...(body === undefined ? {} : {body:JSON.stringify(body)})}); }
describe("expert identity boundary with synthetic auth and storage", () => {
  it("creates an application only for the server mapped UUID", async () => {
    const result = await request("/experts", "alice", {displayName:"Example",expertise:"Synthetic",user_id:b});
    expect(result.status).toBe(201);expect(result.headers.get("cache-control")).toBe("no-store");
    expect(db.insert).toHaveBeenCalledWith("experts",expect.objectContaining({user_id:a,is_public:false}));
  });
  it("does not read or write for unmapped UUID-shaped subjects or mapping outages", async () => {
    for (const user of [b,"unavailable"]) {
      const result = await request("/experts/me",user);
      expect(result.status).toBe(user === b ? 403 : 503);
      expect(JSON.stringify(await result.json())).not.toContain("synthetic secret");
      expect(result.headers.get("cache-control")).toBe("no-store");
    }
    expect(db.getOne.mock.calls.every(call => call[0] === "user_identity_map")).toBe(true);
    expect(db.insert).not.toHaveBeenCalled();expect(db.updateMatchingIds).not.toHaveBeenCalled();
  });
  it("rejects a mismatched owner returned by the privileged private read", async () => {
    db.getOne.mockImplementation(async (table:string) => table === "user_identity_map" ? {supabase_uid:a} : {user_id:b,credentials:{secret:"synthetic private"}});
    const result = await request("/experts/me","alice");
    expect(result.status).toBe(502);expect(JSON.stringify(await result.json())).not.toContain("synthetic private");
  });
  it("rejects a different mapped owner before submission", async () => {
    db.getOne.mockImplementation(async (table:string) => table === "user_identity_map" ? {supabase_uid:b} : {user_id:a,credential_status:"draft"});
    expect((await request(`/experts/${id}/submit`,"bob",{})).status).toBe(403);
    expect(db.updateMatchingIds).not.toHaveBeenCalled();
  });
});
