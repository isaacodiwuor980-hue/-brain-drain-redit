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
  it("never promotes descendants of private, deleted, missing or cyclic parents into public roots", () => {
    const comments = [
      {id:"child",parentId:"private",postId:"p",content:"private child"},
      {id:"grandchild",parentId:"child",postId:"p",content:"private grandchild"},
      {id:"private",parentId:null,postId:"p",isConfidential:true},
      {id:"deleted",parentId:null,postId:"p",isDeleted:true},
      {id:"deleted-child",parentId:"deleted",postId:"p"},
      {id:"missing-child",parentId:"missing",postId:"p"},
      {id:"cycle-a",parentId:"cycle-b",postId:"p"},
      {id:"cycle-b",parentId:"cycle-a",postId:"p"},
      {id:"root",parentId:null,postId:"p"},
      {id:"ok",parentId:"root",postId:"p"},
      {id:"wrong-post",parentId:"root",postId:"other"},
    ] as Comment[];
    const before=structuredClone(comments);
    expect(visibleCommentsWhilePrivacyUnverified(comments).map(c=>c.id)).toEqual(["root","ok"]);
    expect(comments).toEqual(before);
  });
  it("fails closed for duplicate ancestor ids", () => {
    const comments = [{id:"x",parentId:null,postId:"p"},{id:"x",parentId:null,postId:"p",isConfidential:true},{id:"c",parentId:"x",postId:"p"}] as Comment[];
    expect(visibleCommentsWhilePrivacyUnverified(comments)).toEqual([]);
  });
  it("uses the filter in the thread and disables confidential composition", () => {
    const source=readFileSync(new URL("../feed/CommentThread.tsx",import.meta.url),"utf8");
    expect(source).toContain("visibleCommentsWhilePrivacyUnverified(comments)");
    expect(source).not.toContain("c.authorId === postAuthorId");
    expect(source).toContain("Confidential replies are unavailable");
  });
});
