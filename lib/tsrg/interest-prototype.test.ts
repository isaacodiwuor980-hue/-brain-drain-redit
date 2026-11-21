import { describe, expect, it } from "vitest";
import * as engine from "./index";

type Exposure = { id: string; topic: string; at: number; engaged: boolean };
type Interest = (events: readonly Exposure[], now: number, halfLifeMs: number, prior: number) => Map<string, number>;
const candidate = engine as typeof engine & { interestFromExposuresV3?: Interest };
const day = 86_400_000;

describe("offline interest model", () => {
  it("leaves cold start empty and learns engagement separately per topic", () => {
    expect(typeof candidate.interestFromExposuresV3).toBe("function");
    const calculate = candidate.interestFromExposuresV3!;
    expect(calculate([], day, day, 2).size).toBe(0);
    const scores = calculate([
      { id: "1", topic: "art", at: day, engaged: true },
      { id: "2", topic: "sport", at: day, engaged: false },
    ], day, day, 2);
    expect(scores.get("art")).toBeGreaterThan(0.5);
    expect(scores.get("sport")).toBeLessThan(0.5);
  });
  it("fades old evidence toward neutral and reduces scores for repeated observed non-engagement", () => {
    expect(typeof candidate.interestFromExposuresV3).toBe("function");
    const calculate = candidate.interestFromExposuresV3!;
    const initial: Exposure[] = [{ id: "1", topic: "art", at: day, engaged: true }];
    expect(calculate(initial, day + day * 30, day, 2).get("art")!).toBeLessThan(calculate(initial, day, day, 2).get("art")!);
    const lower = calculate([...initial, {id:"2",topic:"art",at:day,engaged:false}, {id:"3",topic:"art",at:day,engaged:false}], day, day, 2);
    expect(lower.get("art")!).toBeLessThan(calculate(initial, day, day, 2).get("art")!);
  });
  it("is independent of event order and rejects duplicates and invalid input", () => {
    expect(typeof candidate.interestFromExposuresV3).toBe("function");
    const calculate = candidate.interestFromExposuresV3!;
    const a = {id:"a",topic:"art",at:1,engaged:true}, b = {id:"b",topic:"art",at:2,engaged:false};
    expect(calculate([a,b], 10, 100, 2).get("art")).toBe(calculate([b,a], 10, 100, 2).get("art"));
    expect(() => calculate([a,a], 10, 100, 2)).toThrow(RangeError);
    expect(() => calculate([{...a, at:11}], 10, 100, 2)).toThrow(RangeError);
    expect(() => calculate([a], 10, 0, 2)).toThrow(RangeError);
    expect(() => calculate([{...a, engaged: "yes" as never}], 10, 100, 2)).toThrow(RangeError);
  });
});
