import type { CircleCheckIn } from "./types";

/**
 * Quora-style toggle vote for circle check-ins — replaces the old
 * always-increment buttons (every tap was +1, up/down stacked, no
 * un-vote). Mirrors togglePostReaction semantics: mutual exclusion,
 * click the active vote again to remove it. My-state lives on the
 * record (myUpvote/myDownvote) since this build is local-first.
 *
 * Extracted from pages/CommunityPage.tsx so the core vote transition is
 * unit-testable without rendering React — keep it a pure function with no
 * storage or UI dependencies.
 */
export function toggleCheckinVote(
  c: CircleCheckIn,
  direction: "up" | "down",
): CircleCheckIn {
  const up = c.myUpvote ?? false;
  const down = c.myDownvote ?? false;
  const upvotes = c.upvotes ?? 0;
  const downvotes = c.downvotes ?? 0;
  if (direction === "up") {
    if (up) return { ...c, upvotes: Math.max(0, upvotes - 1), myUpvote: false };
    return {
      ...c,
      upvotes: upvotes + 1,
      myUpvote: true,
      downvotes: down ? Math.max(0, downvotes - 1) : downvotes,
      myDownvote: false,
    };
  }
  if (down) return { ...c, downvotes: Math.max(0, downvotes - 1), myDownvote: false };
  return {
    ...c,
    downvotes: downvotes + 1,
    myDownvote: true,
    upvotes: up ? Math.max(0, upvotes - 1) : upvotes,
    myUpvote: false,
  };
}
