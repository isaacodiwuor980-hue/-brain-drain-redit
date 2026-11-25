import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
describe("other post surfaces", () => {
  it("do not render vote totals on topic and search pages", () => {
    for (const filename of ["TopicDetailPage.tsx", "SearchPage.tsx"]) {
      const text = readFileSync(new URL(`./${filename}`, import.meta.url), "utf8");
      expect(text).not.toMatch(/\{getPost(?:Upvote|Downvote)Count\(post\)\}/);
    }
  });
});
