import { describe, expect, it } from "vitest";
import { isFeedCursor, isFeedCursorTimestamp } from "./feed-cursor";
describe("feed keyset cursor validation",()=>{
  it("accepts valid database precision without losing microseconds",()=>{
    for(const stamp of ["2024-02-29T12:34:56.123456+00:00","2026-11-16T12:00:00Z","2026-11-16T12:00:00.1-03:30"]) expect(isFeedCursorTimestamp(stamp)).toBe(true);
  });
  it("rejects invalid dates, unbounded precision and filter injection",()=>{
    for(const stamp of ["2025-02-29T12:00:00Z","2026-04-31T12:00:00Z","2026-11-16T24:00:00Z","2026-11-16T12:00:00+14:30","2026-11-16T12:00:00.1234567Z",'2026-11-16T12:00:00Z"),foo']) expect(isFeedCursorTimestamp(stamp)).toBe(false);
    expect(isFeedCursor({id:'bad"),or',createdAt:'2026-11-16T12:00:00Z'})).toBe(false);
  });
});
