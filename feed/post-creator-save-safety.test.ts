import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("post composer save notice", () => {
  it("awaits storage and avoids claiming publication before confirmation", () => {
    const s=readFileSync(new URL("./PostCreator.tsx",import.meta.url),"utf8");
    expect(s).toContain("await onPostCreated(post)");
    expect(s).toContain("If published, this post will be public");
    expect(s).toContain("Keep this editor open");
    expect(s).not.toContain("Your post is now live.");
    expect(s).not.toContain("Your answer has been published.");
    expect(s).not.toContain("Your question has been posted to the community.");
    expect(s).not.toContain("Your inline note is now in the feed.");
  });
});
