import { expect, it } from "vitest";
import { interestFromExposuresV3 } from "./index";
import { interestFromExposuresV4 } from "./interest-v4";

it("handles a representable tiny observation without changing the V3 export", () => {
  const events = [{ id: "a", topic: "art", at: 0, engaged: true }];
  // 2^-1074 and its equal prior are representable but their half underflows.
  expect(interestFromExposuresV3(events, 1074, 1, Number.MIN_VALUE).get("art")).toBe(1);
  expect(interestFromExposuresV4(events, 1074, 1, Number.MIN_VALUE).get("art")).toBe(0.75);
  expect(interestFromExposuresV4([{ ...events[0], engaged: false }], 1074, 1, Number.MIN_VALUE).get("art")).toBe(0.25);
  expect(interestFromExposuresV4(events, 10_000, 1, Number.MIN_VALUE).get("art")).toBe(0.5);
  expect(() => interestFromExposuresV4([events[0], events[0]], 1074, 1, 1)).toThrow(RangeError);
});

it("agrees with V3 on ordinary synthetic inputs within floating-point tolerance", () => {
  for (let i = 1; i <= 500; i++) {
    const events = [{ id: "a", topic: "art", at: i / 2, engaged: true }, { id: "b", topic: "art", at: i / 3, engaged: i % 2 === 0 }];
    expect(interestFromExposuresV4(events, i, 100, 2).get("art")!).toBeCloseTo(interestFromExposuresV3(events, i, 100, 2).get("art")!, 12);
  }
});
