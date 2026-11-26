import { describe, expect, it } from "vitest";
import { FIXED_SCALE, SENTINEL_INVALID, toFixed, WILSON_Z } from "./index";
import { wilsonNoPriorV5 } from "./wilson-no-prior-v5";
import { wilsonPriorCandidateV4 } from "./wilson-prior-v4";

describe("offline no-prior Wilson comparison", () => {
  it("starts at zero and does not reward down-only evidence", () => {
    expect(wilsonNoPriorV5(0n, 0n)).toBe(0);
    expect(wilsonNoPriorV5(0n, toFixed(1))).toBe(0);
    expect(wilsonNoPriorV5(1n, 0n)).toBeGreaterThan(0);
    expect(wilsonPriorCandidateV4(0n, 0n)).toBeGreaterThan(0);
  });
  it("matches ordinary Wilson arithmetic for an unweighted fixture", () => {
    const n = 100, p = 0.7, z2 = WILSON_Z ** 2;
    const expected = (p + z2 / (2*n) - WILSON_Z * Math.sqrt(p*(1-p)/n + z2/(4*n*n))) / (1+z2/n);
    expect(wilsonNoPriorV5(toFixed(70), toFixed(30))).toBeCloseTo(expected, 14);
  });
  it("retains directional monotonicity in deterministic synthetic pairs, including cold start", () => {
    let seed = 8321;
    const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let i=0; i<10000; i++) {
      const up = i === 0 ? 0n : BigInt(next()) * 20n * FIXED_SCALE / 2n**32n;
      const down = i === 0 ? 0n : BigInt(next()) * 20n * FIXED_SCALE / 2n**32n;
      const delta = BigInt(next()) * FIXED_SCALE / 2n**32n + 1n;
      const value = wilsonNoPriorV5(up, down);
      expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1);
      expect(wilsonNoPriorV5(up + delta, down)).toBeGreaterThanOrEqual(value - 1e-12);
      expect(wilsonNoPriorV5(up, down + delta)).toBeLessThanOrEqual(value + 1e-12);
    }
  });
  it("rejects negative and unsafe totals, including down-only totals", () => {
    expect(wilsonNoPriorV5(-1n, 0n)).toBe(SENTINEL_INVALID);
    expect(wilsonNoPriorV5(0n, -1n)).toBe(SENTINEL_INVALID);
    expect(wilsonNoPriorV5(0n, BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toBe(SENTINEL_INVALID);
    expect(wilsonNoPriorV5(1n, BigInt(Number.MAX_SAFE_INTEGER) - 1n)).toBeGreaterThan(0);
    expect(wilsonNoPriorV5(BigInt(Number.MAX_SAFE_INTEGER), 1n)).toBe(SENTINEL_INVALID);
  });
  it("illustrates that mass alone cannot distinguish one large stake from many independent voters", () => {
    // A single weight-10 synthetic vote and ten unit votes have identical mass.
    // The score cannot represent independence or establish confidence.
    expect(wilsonNoPriorV5(toFixed(10), 0n)).toBe(wilsonNoPriorV5(10n * toFixed(1), 0n));
  });
});
