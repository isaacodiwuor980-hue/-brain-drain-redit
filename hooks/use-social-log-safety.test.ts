import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("social feed diagnostic messages", () => {
  it("does not print upstream errors or responses in feed and sync warnings", () => {
    const source = readFileSync(new URL("./use-social.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/console\.warn\([^;]*\b(?:idbErr|error)\b[^;]*\);/s);
    expect(source).not.toContain("error instanceof Error ? error.message : error");
  });
});
