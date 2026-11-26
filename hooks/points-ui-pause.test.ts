import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
describe("paused point displays and callers", () => {
  it("does not claim rewards on saved check-ins or challenge attempts", () => {
    const community = source("../pages/CommunityPage.tsx");
    const challenges = source("./use-daily-challenges.ts");
    const challengeUI = source("../feed/DailyChallengesSection.tsx");
    expect(community).not.toContain("XP earned");
    expect(community).not.toContain("addXPEvent(");
    expect(challenges).toContain("const xpEarned = 0;");
    expect(challenges).not.toContain("addXPEvent(");
    expect(challengeUI).toContain("Points are temporarily paused");
    expect(source("../pages/MissionsPage.tsx")).toContain("Points paused");
  });
});
