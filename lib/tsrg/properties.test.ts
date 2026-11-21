import { describe, expect, it } from "vitest";
import { authorityCompositeV2, bridgingBonusV2, cusumBrigade, detectRings, effectiveMassV2, fromFixedV2, quantizeCommentScore, sanitize, toFixedV2, wilsonLowerBound } from "./index";

// Repeatable local pseudo-random sequence, not a stochastic security proof.
function rng(seed = 1337) { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; }; }
describe("deterministic 500-case invariants", () => {
  it("round trips fixed points within 1e-6", () => { const random = rng(); for (let i = 0; i < 500; i++) { const x = random() * 512 - 256; expect(Math.abs(fromFixedV2(toFixedV2(x)) - x)).toBeLessThan(1e-6); } });
  it("sanitizes idempotently", () => { const random = rng(); for (let i = 0; i < 500; i++) { const x = (random() - 0.5) * 5e9; expect(sanitize(sanitize(x))).toBe(sanitize(x)); } });
  it("quantizes monotonically", () => { const random = rng(); for (let i = 0; i < 500; i++) { const x = random(), y = x + random(); expect(quantizeCommentScore(x)).toBeLessThanOrEqual(quantizeCommentScore(y)); } });
  it("keeps earned authority monotone", () => { const random = rng(); for (let i = 0; i < 500; i++) { const a = random(), b = random(), z = random(); expect(authorityCompositeV2(Math.min(a,b), z)).toBeLessThanOrEqual(authorityCompositeV2(Math.max(a,b), z)); } });
  it("keeps Wilson lower bound monotone when adding positive or negative mass", () => { const random = rng(); for (let i = 0; i < 500; i++) { const up = toFixedV2(1 + 50 * random()), down = toFixedV2(1 + 50 * random()), add = toFixedV2(1 + random()); const original = wilsonLowerBound(up, down); expect(wilsonLowerBound(up + add, down)).toBeGreaterThanOrEqual(original - 1e-12); expect(wilsonLowerBound(up, down + add)).toBeLessThanOrEqual(original + 1e-12); } });
});
describe("adversarial structures, not a production abuse defense", () => {
  it("finds a ten-account complete clique", () => { const edges = Array.from({ length: 10 }, (_, i) => Array.from({ length: i }, (_, j) => ({ u1: `u${i}`, u2: `u${j}`, weight: 1 }))).flat(); const rings = detectRings(edges); expect(rings).toHaveLength(1); expect(rings[0].members.size).toBe(10); expect(rings[0].clusteringCoeff).toBe(1); });
  it("shows no tag-correlation exemption exists", () => { const edges = Array.from({ length: 12 }, (_, i) => Array.from({ length: i }, (_, j) => ({ u1: `u${i}`, u2: `u${j}`, weight: 1 }))).flat(); expect(detectRings(edges)).toHaveLength(1); });
  it("requires a measured temporal gap before awarding support-side bridging", () => { const yes = new Set(["a", "b"]), no = new Set<string>(); expect(bridgingBonusV2(yes, no, 29)).toBe(1); expect(bridgingBonusV2(yes, no, 120)).toBe(1.35); });
  it("shows bridging is directional and not symmetric", () => { const yes = new Set(["a", "b"]), no = new Set<string>(); expect(bridgingBonusV2(yes, no, 120)).toBe(1.35); expect(bridgingBonusV2(no, yes, 120)).toBe(1); });
  it("shows a spike alerts but no cohort-based less-than-one-percent guarantee", () => { expect(cusumBrigade([0, 0, 10000], 0, 1)).toBe(true); const damped = fromFixedV2(effectiveMassV2("mouth", 0.1, 1, true, true)); const nominal = fromFixedV2(effectiveMassV2("mouth", 0.1, 1, false, false)); expect(damped / nominal).toBeGreaterThanOrEqual(0.01); });
});
