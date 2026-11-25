import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("quick decision local save notice", () => {
  it("does not promise sign-in will sync or make the paused library available", () => {
    const source = readFileSync(new URL("./HomeFeed.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("Sign in to sync it across devices");
    expect(source).not.toContain("is in your library now");
    expect(source).not.toContain("Cloud sync may be delayed");
  });
});
