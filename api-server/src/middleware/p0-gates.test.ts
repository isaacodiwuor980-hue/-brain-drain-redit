import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
const mocks = vi.hoisted(() => ({ getOne: vi.fn(), isConfigured: vi.fn(() => true) }));
vi.mock("../lib/supabase", () => ({ supabase: mocks }));
import { requireMappedIdentity } from "./identity-map";
import { requireServerFeature } from "./server-feature-flag";

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as express.Response;
}
beforeEach(() => { mocks.getOne.mockReset(); mocks.isConfigured.mockReturnValue(true); });
describe("staging-only P0 gates", () => {
  it("rejects unknown and malformed Firebase identities without inventing mappings", async () => {
    const res = response(), next = vi.fn();
    mocks.getOne.mockResolvedValue(null);
    await requireMappedIdentity({ auth: { uid: "firebase-user" } } as express.Request, res, next);
    expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
    const res2 = response();
    await requireMappedIdentity({ auth: { uid: "x,evil" } } as express.Request, res2, next);
    expect(res2.status).toHaveBeenCalledWith(403); expect(mocks.getOne).toHaveBeenCalledTimes(1);
  });
  it("attaches mapped UUID only when database verifies the mapping", async () => {
    const req = { auth: { uid: "alice" } } as express.Request, res = response(), next = vi.fn();
    mocks.getOne.mockResolvedValue({ supabase_uid: "00000000-0000-4000-8000-000000000001" });
    await requireMappedIdentity(req, res, next);
    expect(req.mappedUserId).toBe("00000000-0000-4000-8000-000000000001"); expect(next).toHaveBeenCalledOnce();
  });
  it("ignores a client flag when the server flag is off or absent", async () => {
    const res = response(), next = vi.fn(); mocks.getOne.mockResolvedValue({ enabled: false });
    await requireServerFeature("tsrg_phase2_authority_gating")({ headers: { "x-enable-feature": "true" } } as unknown as express.Request, res, next);
    expect(res.status).toHaveBeenCalledWith(404); expect(next).not.toHaveBeenCalled();
    mocks.getOne.mockResolvedValue(null);
    await requireServerFeature("tsrg_phase2_authority_gating")({} as express.Request, response(), next);
    expect(next).not.toHaveBeenCalled();
  });
  it("fails closed on database errors", async () => {
    const res = response(), next = vi.fn(); mocks.getOne.mockRejectedValue(new Error("unavailable"));
    await requireServerFeature("tsrg_phase2_authority_gating")({} as express.Request, res, next);
    expect(res.status).toHaveBeenCalledWith(503); expect(next).not.toHaveBeenCalled();
  });
});
