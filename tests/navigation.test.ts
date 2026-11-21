import { describe, expect, it } from "vitest";
import { fuzzyMatch } from "../ui/command-palette";
import { isNavActive } from "../lib/navigation";

/**
 * Nav/command-palette behaviour that used to be broken:
 *  - the sidebar highlighted NOTHING on nested routes (/topics/react);
 *  - the right rail's search/topic/contributor buttons did not navigate;
 *  - the command palette needs a forgiving matcher so "sys des" finds
 *    "System Design".
 */
describe("shared navigation matching", () => {
  it("only highlights Home on the actual home route", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/", "/library")).toBe(false);
    expect(isNavActive("/", "/?compose=1")).toBe(true);
    expect(isNavActive("/", "/topics/react")).toBe(false);
  });

  it("highlights a parent route for nested paths", () => {
    expect(isNavActive("/topics", "/topics/react")).toBe(true);
    expect(isNavActive("/topics", "/topics")).toBe(true);
    expect(isNavActive("/community", "/community/circle-1?tab=posts")).toBe(true);
  });

  it("ignores the query string when matching", () => {
    expect(isNavActive("/library", "/library?tab=published")).toBe(true);
    expect(isNavActive("/search", "/search?q=react")).toBe(true);
  });

  it("does not treat a sibling path as a child", () => {
    expect(isNavActive("/topic", "/topics")).toBe(false);
    expect(isNavActive("/library", "/libraries")).toBe(false);
  });
});

describe("fuzzyMatch", () => {
  it("matches an empty query to everything", () => {
    expect(fuzzyMatch("", "anything")).toBe(true);
  });

  it("matches substrings case-insensitively", () => {
    expect(fuzzyMatch("LAPTOP", "Which laptop should I buy?")).toBe(true);
  });

  it("matches non-contiguous subsequences", () => {
    expect(fuzzyMatch("sysdes", "System Design")).toBe(true);
    expect(fuzzyMatch("rct", "React")).toBe(true);
  });

  it("rejects genuinely unrelated text", () => {
    expect(fuzzyMatch("zzz", "React")).toBe(false);
  });

  it("respects character order", () => {
    expect(fuzzyMatch("tca", "React")).toBe(false);
  });
});
