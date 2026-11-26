import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("paused vote-derived comment displays", () => {
  it("does not surface legacy vote-selected fossilization as a consensus badge or crown", () => {
    const source = readFileSync(new URL("./CommentThread.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("Consensus Summary Block ·");
    expect(source).not.toContain('node.isFossilized ? "hive-fossilized');
    expect(source).not.toContain('· FOSSILIZED');
    expect(source).not.toContain('fossilized.map(');
  });
});
