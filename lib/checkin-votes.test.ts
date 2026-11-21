import { describe, expect, it } from "vitest";
import { toggleCheckinVote } from "./checkin-votes";
import type { CircleCheckIn } from "./types";

const createCheckin = (overrides: Partial<CircleCheckIn> = {}): CircleCheckIn => ({
  id: "checkin-1",
  circleId: "room-1",
  userId: "user-1",
  message: "Focusing on the relay today",
  moodScore: 4,
  createdAt: Date.now(),
  ...overrides,
});

describe("toggleCheckinVote", () => {
  it("adds an upvote from a neutral check-in and flips the myUpvote flag", () => {
    const next = toggleCheckinVote(createCheckin(), "up");
    expect(next.upvotes).toBe(1);
    expect(next.downvotes).toBe(0);
    expect(next.myUpvote).toBe(true);
    expect(next.myDownvote).toBe(false);
    // Defensive copies — original record must be untouched (local-first immutability).
    expect(next).not.toBe(createCheckin());
  });

  it("removes the upvote when clicking up again (toggle off)", () => {
    const upvoted = toggleCheckinVote(createCheckin(), "up");
    const toggled = toggleCheckinVote(upvoted, "up");
    expect(toggled.upvotes).toBe(0);
    expect(toggled.myUpvote).toBe(false);
  });

  it("switches a prior upvote into a downvote (mutual exclusion)", () => {
    const upvoted = toggleCheckinVote(createCheckin(), "up");
    const downvoted = toggleCheckinVote(upvoted, "down");
    expect(downvoted.upvotes).toBe(0);
    expect(downvoted.downvotes).toBe(1);
    expect(downvoted.myUpvote).toBe(false);
    expect(downvoted.myDownvote).toBe(true);
  });

  it("switches a prior downvote into an upvote (mutual exclusion)", () => {
    const downvoted = toggleCheckinVote(createCheckin({ downvotes: 2, myDownvote: true }), "up");
    expect(downvoted.upvotes).toBe(1);
    expect(downvoted.downvotes).toBe(1);
    expect(downvoted.myDownvote).toBe(false);
    expect(downvoted.myUpvote).toBe(true);
  });

  it("removes a downvote when clicking down again (toggle off)", () => {
    const downvoted = toggleCheckinVote(createCheckin({ downvotes: 1, myDownvote: true }), "down");
    expect(downvoted.downvotes).toBe(0);
    expect(downvoted.myDownvote).toBe(false);
  });

  it("never drives counts below zero and tolerates missing fields", () => {
    const toggled = toggleCheckinVote(createCheckin({ upvotes: 0, myUpvote: true }), "up");
    expect(toggled.upvotes).toBe(0);
    expect(toggled.myUpvote).toBe(false);
    // A record with no vote fields at all still works.
    const fresh = toggleCheckinVote(createCheckin(), "down");
    expect(fresh.downvotes).toBe(1);
    expect(fresh.myDownvote).toBe(true);
  });
});
