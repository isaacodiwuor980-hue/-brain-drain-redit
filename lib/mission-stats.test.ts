import { describe, expect, it } from "vitest";
import { computeCategoryStats, computeCompletionRate } from "./mission-stats";

describe("computeCompletionRate", () => {
  it("returns 0 for an empty milestone list (honest fresh-account state)", () => {
    expect(computeCompletionRate([])).toBe(0);
  });

  it("returns 0 when nothing is completed", () => {
    expect(computeCompletionRate([{ completed: false }, { completed: false }])).toBe(0);
  });

  it("returns 100 when all are completed", () => {
    expect(computeCompletionRate([{ completed: true }, { completed: true }])).toBe(100);
  });

  it("rounds to the nearest whole percent", () => {
    // 1 of 3 → 33.33% → 33
    expect(computeCompletionRate([{ completed: true }, { completed: false }, { completed: false }])).toBe(33);
    // 2 of 3 → 66.67% → 67
    expect(computeCompletionRate([{ completed: true }, { completed: true }, { completed: false }])).toBe(67);
  });
});

describe("computeCategoryStats", () => {
  it("returns an empty list when there are no missions", () => {
    expect(computeCategoryStats([])).toEqual([]);
  });

  it("averages progress per category and counts missions", () => {
    const missions = [
      { category: "Learning", progress: 40 },
      { category: "Learning", progress: 80 },
      { category: "Business", progress: 10 },
    ];
    const stats = computeCategoryStats(missions);
    expect(stats).toEqual([
      { category: "Business", avg: 10, count: 1 },
      { category: "Learning", avg: 60, count: 2 },
    ]);
  });

  it("rounds averages to whole numbers", () => {
    // (10 + 15) / 2 = 12.5 → 13
    const stats = computeCategoryStats([
      { category: "A", progress: 10 },
      { category: "A", progress: 15 },
    ]);
    expect(stats[0].avg).toBe(13);
  });

  it("sorts categories alphabetically for stable rendering", () => {
    const stats = computeCategoryStats([
      { category: "Wellness", progress: 50 },
      { category: "Business", progress: 20 },
    ]);
    expect(stats.map((s) => s.category)).toEqual(["Business", "Wellness"]);
  });

  it("omits categories with no missions (cannot occur via Map grouping)", () => {
    const stats = computeCategoryStats([{ category: "Solo", progress: 0 }]);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toEqual({ category: "Solo", avg: 0, count: 1 });
  });
});
