import { describe, expect, it } from "vitest";
import { summarizeIdentityLinkPlan } from "./identity-link-plan";
const a = "00000000-0000-4000-8000-000000000001", b = "00000000-0000-4000-8000-000000000002", c = "00000000-0000-4000-8000-000000000003";

describe("offline identity map planning", () => {
  it("counts exact mappings and new reviewed pairs without exposing identifiers", () => {
    const result = summarizeIdentityLinkPlan([{ subject: "synthetic-a", uuid: a }, { subject: "synthetic-b", uuid: b }], [{ subject: "synthetic-a", uuid: a }], new Set([a, b]));
    expect(result).toEqual({ total: 2, unchanged: 1, proposed: 1, invalid: 0, duplicate: 0, missingUser: 0, conflict: 0 });
    expect(JSON.stringify(result)).not.toContain("synthetic"); expect(JSON.stringify(result)).not.toContain(a);
  });
  it("quarantines every duplicate, missing user and subject/UUID conflict", () => {
    const pairs = [{ subject: "repeat", uuid: b }, { subject: "repeat", uuid: c }, { subject: "new", uuid: c }, { subject: "other", uuid: a }, { subject: "missing", uuid: "00000000-0000-4000-8000-000000000004" }, { subject: "bad!", uuid: b }];
    const result = summarizeIdentityLinkPlan(pairs, [{ subject: "already", uuid: a }], new Set([a, b, c]));
    expect(result).toEqual({ total: 6, unchanged: 0, proposed: 0, invalid: 1, duplicate: 3, missingUser: 1, conflict: 1 });
  });
  it("quarantines a valid pair when its UUID also appears on a malformed pair", () => {
    const result = summarizeIdentityLinkPlan([{subject:"valid", uuid:b}, {subject:"bad!", uuid:b}], [], new Set([b]));
    expect(result).toEqual({ total: 2, unchanged: 0, proposed: 0, invalid: 1, duplicate: 1, missingUser: 0, conflict: 0 });
  });
  it("never accepts casing differences as separate UUIDs and rejects invalid snapshots", () => {
    const uuid = "ABCDEFAB-0000-4000-8000-000000000001";
    expect(summarizeIdentityLinkPlan([{subject: "same", uuid: uuid.toUpperCase()}], [{subject: "same", uuid: uuid.toLowerCase()}], new Set([uuid.toLowerCase()])).unchanged).toBe(1);
    expect(() => summarizeIdentityLinkPlan([], [{subject: "one", uuid: a}, {subject: "two", uuid: a}], new Set([a]))).toThrow(RangeError);
  });
});
