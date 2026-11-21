import { describe, expect, it } from "vitest";
import * as engine from "./index";

const candidate = engine as typeof engine & {
  bridgingBonusSymmetricV3?: (support: ReadonlySet<string>, oppose: ReadonlySet<string>, medianGapMinutes: number | null) => number;
};

describe("symmetric bridge prototype", () => {
  it("gives either side the same bonus for independent groups", () => {
    expect(typeof candidate.bridgingBonusSymmetricV3).toBe("function");
    const bridge = candidate.bridgingBonusSymmetricV3!;
    const diverse = new Set(["a", "b"]), other = new Set(["c"]);
    expect(bridge(diverse, other, 30)).toBe(1.35);
    expect(bridge(other, diverse, 30)).toBe(1.35);
  });
  it("requires distinct groups on a side and a valid gap", () => {
    expect(typeof candidate.bridgingBonusSymmetricV3).toBe("function");
    const bridge = candidate.bridgingBonusSymmetricV3!;
    const both = new Set(["a", "b"]);
    expect(bridge(both, both, 30)).toBe(1);
    expect(bridge(both, new Set(), 29)).toBe(1);
    expect(bridge(both, new Set(), null)).toBe(1);
    expect(bridge(both, new Set(), NaN)).toBe(1);
    expect(bridge(new Set(["", "a"]), new Set(), 30)).toBe(1);
  });
});
