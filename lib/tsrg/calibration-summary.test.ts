import { describe, expect, it } from "vitest";
import { summarizeCalibrationV3, type ReviewedAnswerV3 } from "./calibration-summary";

const answer = (overrides: Partial<ReviewedAnswerV3> = {}): ReviewedAnswerV3 => ({
  questionId: "q1", topic: "programming", optionCount: 4, selected: 1, verifiedAnswer: 1, ...overrides,
});

describe("offline reviewed-answer calibration summary", () => {
  it("returns no estimate with no reviewed questions", () => {
    expect(summarizeCalibrationV3("programming", [])).toBeNull();
  });
  it("compares answers with keys and reports a per-question uniform-guess baseline", () => {
    const result = summarizeCalibrationV3("programming", [answer(), answer({ questionId: "q2", optionCount: 2, selected: 0, verifiedAnswer: 1 })]);
    expect(result).toEqual({ reviewed: 2, correct: 1, fractionCorrect: 0.5, uniformGuessBaseline: 0.375 });
  });
  it("tracks a repeatable 10,000-question uniform-guess fixture without claiming expertise", () => {
    let seed = 173;
    const entries = Array.from({ length: 10_000 }, (_, i) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return answer({ questionId: `q${i}`, selected: Math.floor((seed / 2 ** 32) * 4), verifiedAnswer: 0 });
    });
    const summary = summarizeCalibrationV3("programming", entries)!;
    expect(summary.uniformGuessBaseline).toBe(0.25);
    expect(summary.fractionCorrect).toBeGreaterThan(0.23);
    expect(summary.fractionCorrect).toBeLessThan(0.27);
  });
  it("cannot distinguish knowledge from a leaked answer key", () => {
    const honest = [answer({ questionId: "q1" }), answer({ questionId: "q2" })];
    const leaked = [answer({ questionId: "q1" }), answer({ questionId: "q2" })];
    expect(summarizeCalibrationV3("programming", honest)).toEqual(summarizeCalibrationV3("programming", leaked));
  });
  it("is deterministic regardless of input order", () => {
    const entries = [answer(), answer({ questionId: "q2", optionCount: 3, selected: 2, verifiedAnswer: 1 }), answer({ questionId: "q3", optionCount: 7 })];
    expect(summarizeCalibrationV3("programming", entries)).toEqual(summarizeCalibrationV3("programming", [...entries].reverse()));
  });
  it("rejects duplicates, wrong topics and invalid response or key values", () => {
    expect(() => summarizeCalibrationV3("programming", [answer(), answer()])).toThrow(RangeError);
    for (const invalid of [answer({ topic: "gaming" }), answer({ questionId: "" }), answer({ optionCount: 1 }), answer({ optionCount: 9 }), answer({ optionCount: 3.5 }), answer({ selected: -1 }), answer({ selected: 4 }), answer({ verifiedAnswer: 4 }), answer({ verifiedAnswer: NaN })]) {
      expect(() => summarizeCalibrationV3("programming", [invalid])).toThrow(RangeError);
    }
    expect(() => summarizeCalibrationV3("", [])).toThrow(RangeError);
  });
});
