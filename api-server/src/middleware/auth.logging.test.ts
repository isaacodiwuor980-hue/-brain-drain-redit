import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const mock = vi.hoisted(() => ({ verify: vi.fn(), warn: vi.fn(), error: vi.fn(), UpstreamError: class extends Error {} }));
vi.mock("../lib/firebase-auth", () => ({ extractBearerToken: () => "synthetic-token", verifyFirebaseToken: mock.verify, FirebaseAuthUpstreamError: mock.UpstreamError }));
vi.mock("../lib/logger", () => ({ logger: { warn: mock.warn, error: mock.error } }));
import { optionalAuth, requireAuth } from "./auth";

beforeEach(() => vi.resetAllMocks());
function setup() {
  const req = { headers: {} } as Request;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}
describe("authentication error log privacy", () => {
  it.each(["required", "optional"])("never logs upstream error details for %s auth", async kind => {
    mock.verify.mockRejectedValue(new mock.UpstreamError("fetch failure: synthetic-sensitive-token"));
    const { req, res, next } = setup();
    await (kind === "required" ? requireAuth(req, res, next) : optionalAuth(req, res, next));
    expect(mock.warn.mock.calls[0][0]).not.toHaveProperty("err");
    expect(JSON.stringify(mock.warn.mock.calls)).not.toContain("synthetic-sensitive-token");
    if (kind === "required") expect(res.status).toHaveBeenCalledWith(502);
    else expect(next).toHaveBeenCalledOnce();
  });
  it("never logs configuration error details", async () => {
    mock.verify.mockRejectedValue(new Error("Unsupported token algorithm: synthetic-sensitive-token"));
    const { req, res, next } = setup(); await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mock.error.mock.calls[0][0]).not.toHaveProperty("err");
    expect(JSON.stringify(mock.error.mock.calls)).not.toContain("synthetic-sensitive-token");
  });
});
