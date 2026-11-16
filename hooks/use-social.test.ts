/**
 * Regression test for the feed-failure-surfacing fix.
 *
 * Defect being guarded: before the fix, useSocial's queryFn caught every
 * fetchFeed error and returned cached/seed data. React Query saw a
 * successful resolution, so isError stayed false. The UI rendered fallback
 * posts with NO error/retry UI — a backend failure was indistinguishable
 * from a successful load of a genuinely empty feed.
 *
 * The fix: useSocial now exposes `feedFailed` (true when the last cloud
 * fetch failed with a non-auth error) and `refetchFeed`. The decision of
 * whether to surface is centralized in shouldSurfaceFeedError() so it can
 * be unit-tested without rendering React.
 *
 * Fails-before / passes-after contract:
 *  - 401 (auth, expected for guests) → NOT surfaced (feedFailed stays false)
 *  - network error / TypeError → surfaced (feedFailed becomes true)
 *  - 500 / 502 / 503 / timeout → surfaced
 */
import { describe, it, expect } from "vitest";
import { ApiError } from "../lib/api-client";
import { shouldSurfaceFeedError } from "./use-social";

describe("shouldSurfaceFeedError (feed-failure surfacing)", () => {
  it("does NOT surface 401 (auth required — expected for guests)", () => {
    const err = new ApiError("Authentication required", 401);
    expect(shouldSurfaceFeedError(err)).toBe(false);
  });

  it("surfaces 500 (server error)", () => {
    const err = new ApiError("Internal server error", 500);
    expect(shouldSurfaceFeedError(err)).toBe(true);
  });

  it("surfaces 502 (bad gateway / Supabase down)", () => {
    const err = new ApiError("Bad gateway", 502);
    expect(shouldSurfaceFeedError(err)).toBe(true);
  });

  it("surfaces 503 (service unavailable)", () => {
    const err = new ApiError("Service unavailable", 503);
    expect(shouldSurfaceFeedError(err)).toBe(true);
  });

  it("surfaces 429 (rate limited)", () => {
    const err = new ApiError("Too many requests", 429);
    expect(shouldSurfaceFeedError(err)).toBe(true);
  });

  it("surfaces network error (TypeError: Failed to fetch)", () => {
    const err = new TypeError("Failed to fetch");
    expect(shouldSurfaceFeedError(err)).toBe(true);
  });

  it("surfaces timeout (AbortError)", () => {
    const err = new DOMException("The operation was aborted", "AbortError");
    expect(shouldSurfaceFeedError(err)).toBe(true);
  });

  it("surfaces generic Error", () => {
    expect(shouldSurfaceFeedError(new Error("boom"))).toBe(true);
  });

  it("surfaces non-Error throwables (string, undefined)", () => {
    expect(shouldSurfaceFeedError("network failed")).toBe(true);
    expect(shouldSurfaceFeedError(undefined)).toBe(true);
    expect(shouldSurfaceFeedError(null)).toBe(true);
  });

  it("only 401 is suppressed — not 403, 404, or other 4xx", () => {
    expect(shouldSurfaceFeedError(new ApiError("Forbidden", 403))).toBe(true);
    expect(shouldSurfaceFeedError(new ApiError("Not found", 404))).toBe(true);
    expect(shouldSurfaceFeedError(new ApiError("Validation", 422))).toBe(true);
  });
});
