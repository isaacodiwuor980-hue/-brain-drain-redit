import { describe, it, expect } from "vitest";
import { getRoomRole, getRoomVisibility } from "./room-logic";

describe("getRoomRole", () => {
  it("returns the stored role when present (wins over membership)", () => {
    expect(getRoomRole({ role: "steward", joinStatus: "member" })).toBe("steward");
    expect(getRoomRole({ role: "curator" })).toBe("curator");
    expect(getRoomRole({ role: "observer", joinStatus: "member" })).toBe("observer");
    expect(getRoomRole({ role: "contributor" })).toBe("contributor");
  });

  it("defaults a member with no stored role to contributor", () => {
    expect(getRoomRole({ joinStatus: "member" })).toBe("contributor");
  });

  it("returns null for non-members so no badge renders", () => {
    expect(getRoomRole({ joinStatus: "not_member" })).toBeNull();
    expect(getRoomRole({ joinStatus: "pending" })).toBeNull();
    expect(getRoomRole({})).toBeNull();
  });
});

describe("getRoomVisibility", () => {
  it("prefers the stored visibility over legacy privacy", () => {
    expect(getRoomVisibility({ visibility: "sealed", privacy: "public" })).toBe("sealed");
    expect(getRoomVisibility({ visibility: "gated" })).toBe("gated");
    expect(getRoomVisibility({ visibility: "open" })).toBe("open");
  });

  it("maps legacy privacy values to Room visibility", () => {
    expect(getRoomVisibility({ privacy: "public" })).toBe("open");
    expect(getRoomVisibility({ privacy: "restricted" })).toBe("gated");
    expect(getRoomVisibility({ privacy: "private" })).toBe("sealed");
  });

  it("defaults to open when neither is set", () => {
    expect(getRoomVisibility({})).toBe("open");
    expect(getRoomVisibility({ privacy: undefined, visibility: undefined })).toBe("open");
  });
});
