import { describe, expect, it } from "vitest";
import { evaluateTwoStepVoteV1 } from "./two-step-vote-v1";

describe("two-step vote policy (offline model only)", () => {
  for (const [first, second] of [["upvote", "downvote"], ["house", "mouth"]] as const) {
    it(`requires removing ${first} before choosing ${second}, in both directions`, () => {
      for (const [current, opposite] of [[first, second], [second, first]] as const) {
        expect(evaluateTwoStepVoteV1(current, opposite, [first, second])).toBe("remove_first");
        expect(evaluateTwoStepVoteV1(current, null, [first, second])).toBe("allowed");
        expect(evaluateTwoStepVoteV1(null, opposite, [first, second])).toBe("allowed");
        expect(evaluateTwoStepVoteV1(current, current, [first, second])).toBe("allowed");
      }
    });
  }
  it("rejects unexpected and ambiguous states rather than silently allowing them", () => {
    expect(evaluateTwoStepVoteV1("both", "upvote", ["upvote", "downvote"])).toBe("invalid");
    expect(evaluateTwoStepVoteV1(null, "house", ["upvote", "downvote"])).toBe("invalid");
    expect(evaluateTwoStepVoteV1(null, null, ["same", "same"])).toBe("invalid");
  });
});
