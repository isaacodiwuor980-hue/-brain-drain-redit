import { describe, expect, it } from "vitest";
import * as pipeline from "./feed-pipeline";
import type { FeedCandidate } from "./feed-pipeline";
type Caps = { windowSize: number; author: number; topic: number; source: number };
const diversify = (pipeline as typeof pipeline & { diversifyOffline?: (items: readonly FeedCandidate[], caps: Caps) => FeedCandidate[] }).diversifyOffline;
const post = (id: string, author: string, topic: string, source: string): FeedCandidate => ({ id, author, topic, source, signals: {quality: 0.5, relevance: 0.5} });

describe("offline diversity pass", () => {
  it("promotes a different author and topic when available without dropping posts", () => {
    expect(typeof diversify).toBe("function");
    const data = [post("a","same","one","x"), post("b","same","one","x"), post("c","other","two","y")];
    expect(diversify!(data, {windowSize: 3, author: 1, topic: 1, source: 2}).map(p => p.id)).toEqual(["a", "c", "b"]);
    expect(data.map(p => p.id)).toEqual(["a", "b", "c"]);
  });
  it("keeps all items when no compliant alternative exists and is deterministic", () => {
    expect(typeof diversify).toBe("function");
    const data = [post("a","same","one","x"), post("b","same","one","x")];
    const caps = {windowSize: 4, author: 1, topic: 1, source: 1};
    for (let i = 0; i < 100; i++) expect(diversify!(data, caps).map(p => p.id)).toEqual(["a", "b"]);
    expect(diversify!([], caps)).toEqual([]);
  });
  it("rejects malformed caps and duplicate candidates", () => {
    expect(typeof diversify).toBe("function");
    const a = post("a", "u", "t", "s");
    const caps = {windowSize: 2, author: 1, topic: 1, source: 1};
    expect(() => diversify!([a,a], caps)).toThrow(RangeError);
    expect(() => diversify!([a], {...caps, windowSize: 0})).toThrow(RangeError);
    expect(() => diversify!([a], {...caps, author: 0})).toThrow(RangeError);
    expect(() => diversify!([a], {...caps, topic: 3})).toThrow(RangeError);
  });
});
