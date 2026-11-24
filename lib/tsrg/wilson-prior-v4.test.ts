import { describe, expect, it } from "vitest";
import { FIXED_SCALE, SENTINEL_INVALID, toFixed } from "./index";
import { wilsonPriorCandidateV3 } from "./wilson-prior-candidate";
import { wilsonPriorCandidateV4 } from "./wilson-prior-v4";

describe("offline consistent-prior comparison V4", () => {
  it("removes the zero-vote jump while keeping nonempty V3 results", () => {
    const cold = wilsonPriorCandidateV4(0n, 0n);
    expect(cold).toBeGreaterThan(0);
    expect(wilsonPriorCandidateV4(0n, 1n)).toBeLessThanOrEqual(cold + 1e-15);
    expect(wilsonPriorCandidateV4(0n, toFixed(1))).toBeLessThan(cold);
    expect(wilsonPriorCandidateV4(toFixed(1), 0n)).toBeGreaterThan(cold);
    expect(wilsonPriorCandidateV4(toFixed(0.35), toFixed(1.95))).toBe(wilsonPriorCandidateV3(toFixed(0.35), toFixed(1.95)));
    expect(wilsonPriorCandidateV3(0n, 0n)).toBe(0);
  });
  it("rejects invalid and unsafe mass like V3", () => {
    expect(wilsonPriorCandidateV4(-1n, 0n)).toBe(SENTINEL_INVALID);
    expect(wilsonPriorCandidateV4(0n, -1n)).toBe(SENTINEL_INVALID);
    expect(wilsonPriorCandidateV4(BigInt(Number.MAX_SAFE_INTEGER), 1n)).toBe(SENTINEL_INVALID);
  });
  it("is bounded and directionally monotone in synthetic pairs including cold start", () => {
    let seed = 719;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    for (let i = 0; i < 10000; i++) {
      const up = i === 0 ? 0n : BigInt(Math.floor(random() * 20 * Number(FIXED_SCALE)));
      const down = i === 0 ? 0n : BigInt(Math.floor(random() * 20 * Number(FIXED_SCALE)));
      const delta = BigInt(Math.floor(random() * Number(FIXED_SCALE))) + 1n;
      const score = wilsonPriorCandidateV4(up, down);
      expect(score).toBeGreaterThanOrEqual(0); expect(score).toBeLessThanOrEqual(1);
      expect(wilsonPriorCandidateV4(up + delta, down)).toBeGreaterThanOrEqual(score - 1e-12);
      expect(wilsonPriorCandidateV4(up, down + delta)).toBeLessThanOrEqual(score + 1e-12);
    }
  });
});
