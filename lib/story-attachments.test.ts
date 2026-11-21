import { describe, expect, it } from "vitest";
import { safeStoryLink, storyFileKind, STORY_FILE_LIMIT } from "./story-attachments";
describe("story attachment validation", () => {
  it("accepts only web links without embedded credentials", () => {
    expect(safeStoryLink("https://example.com/test")).toBe("https://example.com/test");
    for (const value of ["javascript:alert(1)", "data:text/html,test", "https://u:p@example.com", "bad"]) expect(safeStoryLink(value)).toBeNull();
  });
  it("limits types and size", () => {
    expect(storyFileKind({ name: "a.png", type: "image/png", size: 100 })).toBe("image");
    expect(storyFileKind({ name: "a.pdf", type: "application/pdf", size: 100 })).toBe("file");
    expect(storyFileKind({ name: "a.html", type: "text/html", size: 100 })).toBe("html");
    expect(() => storyFileKind({ name: "a.svg", type: "image/svg+xml", size: 1 })).toThrow();
    expect(() => storyFileKind({ name: "a.png", type: "image/png", size: STORY_FILE_LIMIT + 1 })).toThrow();
  });
});
