import { describe, expect, it } from "vitest";
import { maySendPostAs } from "./post-owner-safety";

describe("post send owner binding", () => {
  it("rejects guest, missing, legacy and switched identities", () => {
    for (const [owner, uid, token] of [["a","b","token-b"],["a",null,null],["me","a","token-a"],["guest-123","a","token-a"],["a","a",null]] as const) {
      expect(maySendPostAs(owner, uid ? {uid, token} : null)).toBe(false);
    }
  });
  it("permits only a nonlegacy matching owner with a token", () => {
    expect(maySendPostAs("a", {uid:"a", token:"token-a"})).toBe(true);
    expect(maySendPostAs("", {uid:"", token:"token"})).toBe(false);
  });
});
