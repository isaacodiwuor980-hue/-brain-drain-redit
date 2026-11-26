import { describe, expect, it, vi, afterEach } from "vitest";
import { computeBackoffMs, isRetryableStatus } from "./api-client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("computeBackoffMs", () => {
  it("never exceeds the cap", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(computeBackoffMs(attempt, 8_000)).toBeLessThanOrEqual(8_000);
    }
  });

  it("applies jitter (is not deterministic)", () => {
    const values = new Set(Array.from({ length: 40 }, () => computeBackoffMs(3, 8_000)));
    expect(values.size).toBeGreaterThan(1);
  });

  it("stays inside [0, exponential window] per attempt", () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const cap = Math.min(8_000, 250 * 2 ** attempt);
      for (let i = 0; i < 25; i++) {
        const value = computeBackoffMs(attempt, 8_000);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(cap);
      }
    }
  });

  it("grows the window with the attempt count (until the cap)", () => {
    // Average of many samples approximates exponential/2.
    const sample = (attempt: number) => {
      let sum = 0;
      for (let i = 0; i < 200; i++) sum += computeBackoffMs(attempt, 8_000);
      return sum / 200;
    };
    expect(sample(2)).toBeGreaterThan(sample(0));
    expect(sample(4)).toBeGreaterThan(sample(2));
  });

  it("returns an integer", () => {
    expect(Number.isInteger(computeBackoffMs(2))).toBe(true);
  });
});

describe("isRetryableStatus", () => {
  it("retries transient conditions only", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it("never retries deterministic client errors", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(422)).toBe(false);
  });
});
