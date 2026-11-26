import { describe, it, expect } from "vitest";
import { authorityTier, bridgingBonus, canStake, cusumBrigade, effectiveMass, fromFixed, sanitize, SENTINEL_INVALID, toFixed, wilsonLowerBound } from "./index";
import { orderFeed, rankExperimentalFeed } from "./feed";
import type { Post } from "../types";

describe("experimental TSRG primitives", () => {
  it("preserves invalid sentinel on repeated sanitization", () => {
    for (const v of [NaN, Infinity, SENTINEL_INVALID, -5, 1e12, 0.5]) expect(sanitize(sanitize(v))).toBe(sanitize(v));
  });
  it("round-trips fixed mass and rejects overflow or non-finite inputs", () => {
    expect(fromFixed(toFixed(0.75))).toBe(0.75);
    expect(() => toFixed(NaN)).toThrow();
    expect(() => toFixed(257)).toThrow();
    expect(() => fromFixed(1n << 54n)).toThrow();
    expect(Array(10000).fill(toFixed(1)).reduce((a, b) => a + b, 0n)).toBe(toFixed(1) * 10000n);
  });
  it("guards zero, negative and excessive inputs in Wilson", () => {
    expect(wilsonLowerBound(0n, 0n)).toBe(0);
    expect(wilsonLowerBound(-1n, 1n)).toBe(SENTINEL_INVALID);
    expect(wilsonLowerBound(1n << 54n, 0n)).toBe(SENTINEL_INVALID);
    expect(wilsonLowerBound(toFixed(10), toFixed(2))).toBeGreaterThan(wilsonLowerBound(toFixed(2), toFixed(10)));
  });
  it("gates using the specified tag and rejects non-finite age", () => {
    expect(authorityTier(0.15)).toBe(1);
    expect(canStake(new Map([["games", 1]]), "medicine", "life", 30)).toBe(false);
    expect(canStake(new Map([["medicine", 0.6]]), "medicine", "house", 30)).toBe(true);
    expect(canStake(new Map([["medicine", 0.6]]), "medicine", "life", 30)).toBe(false);
    expect(canStake(new Map([["medicine", 1]]), "medicine", "life", NaN)).toBe(false);
  });
  it("applies mass dampening and cross-cluster and velocity heuristics", () => {
    expect(effectiveMass("mouth", 0.2, 2, true, true)).toBeLessThan(effectiveMass("mouth", 0.2, 10, false, false));
    expect(bridgingBonus(new Set(["a", "b"]), new Set(["c"]))).toBe(1.35);
    expect(bridgingBonus(new Set(["a", "b"]), new Set(["b"]))).toBe(1);
    expect(cusumBrigade([10, 12, 15], 10, 1)).toBe(true);
    expect(cusumBrigade([NaN, 30], 10, 1)).toBe(false);
  });
  it("orders only loaded posts, preserving cold and malformed posts", () => {
    const make = (id: string, upvote: number, downvote: number) => ({ id, createdAt: 1000, reactions: { upvote, downvote } }) as Post;
    const list = [make("cold", 0, 0), make("down", 1, 10), make("up", 10, 1), make("bad", NaN, 1)];
    expect(rankExperimentalFeed(list, 1000).map(p => p.id)).toEqual(["up", "down", "cold", "bad"]);
    expect(list.map(p => p.id)).toEqual(["cold", "down", "up", "bad"]);
  });
  it("keeps default and following feeds chronological when the experiment is off or inapplicable", () => {
    const posts = [
      { id: "old", createdAt: 1, reactions: { upvote: 10, downvote: 0 } },
      { id: "new", createdAt: 2, reactions: { upvote: 0, downvote: 0 } },
    ] as Post[];
    expect(orderFeed(posts, "foryou", false, 2).map(p => p.id)).toEqual(["new", "old"]);
    expect(orderFeed(posts, "following", true, 2).map(p => p.id)).toEqual(["new", "old"]);
    expect(orderFeed(posts, "foryou", true, 2).map(p => p.id)).toEqual(["old", "new"]);
  });

});
