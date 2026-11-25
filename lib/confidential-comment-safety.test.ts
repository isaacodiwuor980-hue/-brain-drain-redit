import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { visibleCommentsWhilePrivacyUnverified } from "./confidential-comment-safety";
import type { Comment } from "./types";

describe("unverified confidential comments", () => {
  it("hides confidential entries irrespective of account or ownership and preserves stored objects", () => {
    const comments = [
      {id:"public",isConfidential:false,content:"public"},
      {id:"private-author",isConfidential:true,authorId:"alice",content:"secret"},
      {id:"private-legacy",isConfidential:true,authorId:"me",content:"legacy secret"},
    ] as Comment[];
    const before=structuredClone(comments);
    expect(visibleCommentsWhilePrivacyUnverified(comments).map(c=>c.id)).toEqual(["public"]);
    expect(comments).toEqual(before);
  });
  it("uses the filter in the thread and disables confidential composition", () => {
    const source=readFileSync(new URL("../feed/CommentThread.tsx",import.meta.url),"utf8");
    expect(source).toContain("visibleCommentsWhilePrivacyUnverified(comments)");
    expect(source).not.toContain("c.authorId === postAuthorId");
    expect(source).toContain("Confidential replies are unavailable");
  });
});
