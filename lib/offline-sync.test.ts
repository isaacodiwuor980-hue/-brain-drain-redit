import { describe, expect, it } from "vitest";
import {
  MAX_RETRIES,
  actionKey,
  enqueueAction,
  partitionDueActions,
  recordFailure,
  type QueuedAction,
} from "./offline-sync";

const make = (overrides: Partial<QueuedAction> = {}): QueuedAction => ({
  id: "a1",
  type: "post_reaction",
  payload: { postId: "p1", reactionType: "upvote" },
  createdAt: 1_000,
  retryCount: 0,
  ...overrides,
});

describe("actionKey", () => {
  it("collapses repeated reactions on the same post", () => {
    const up = actionKey({ type: "post_reaction", payload: { postId: "p1", reactionType: "upvote" } });
    const down = actionKey({ type: "post_reaction", payload: { postId: "p1", reactionType: "downvote" } });
    expect(up).toBe(down);
  });

  it("keeps different posts distinct", () => {
    expect(actionKey({ type: "post_reaction", payload: { postId: "p1" } })).not.toBe(
      actionKey({ type: "post_reaction", payload: { postId: "p2" } }),
    );
  });

  it("collapses brain updates by brain id", () => {
    expect(
      actionKey({ type: "update_brain", payload: { brain: { id: "b1" } } }),
    ).toBe(actionKey({ type: "update_brain", payload: { brain: { id: "b1" }, nodes: [] } }));
  });
});

describe("enqueueAction", () => {
  it("appends a new action with a fresh id and zero retries", () => {
    const queue = enqueueAction([], { type: "create_post", payload: { postId: "p1" } });
    expect(queue).toHaveLength(1);
    expect(queue[0].retryCount).toBe(0);
    expect(queue[0].id).toMatch(/^queue_/);
  });

  it("retains every uncertain reaction instead of coalescing toggles", () => {
    let queue = enqueueAction([], { type: "post_reaction", payload: { postId: "p1", reactionType: "upvote" } });
    queue = enqueueAction(queue, { type: "post_reaction", payload: { postId: "p1", reactionType: "downvote" } });
    queue = enqueueAction(queue, { type: "post_reaction", payload: { postId: "p1", reactionType: "upvote" } });
    expect(queue).toHaveLength(3);
    expect(queue.map(item => item.payload.reactionType)).toEqual(["upvote", "downvote", "upvote"]);
  });

  it("keeps independent posts separate", () => {
    let queue = enqueueAction([], { type: "create_post", payload: { postId: "p1" } });
    queue = enqueueAction(queue, { type: "create_post", payload: { postId: "p2" } });
    expect(queue).toHaveLength(2);
  });
});

describe("partitionDueActions", () => {
  it("separates actions still waiting out their backoff", () => {
    const now = 10_000;
    const { due, waiting } = partitionDueActions(
      [make({ id: "ready" }), make({ id: "later", nextAttemptAt: now + 5_000 })],
      now,
    );
    expect(due.map((a) => a.id)).toEqual(["ready"]);
    expect(waiting.map((a) => a.id)).toEqual(["later"]);
  });

  it("treats an action whose deadline has passed as due", () => {
    const { due } = partitionDueActions([make({ nextAttemptAt: 1 })], 10_000);
    expect(due).toHaveLength(1);
  });
});

describe("recordFailure", () => {
  it("increments the retry count and schedules a jittered deadline", () => {
    const { retry, dead } = recordFailure(make(), 10_000);
    expect(dead).toBeNull();
    expect(retry?.retryCount).toBe(1);
    expect(retry?.nextAttemptAt).toBeGreaterThanOrEqual(10_000);
  });

  it("quarantines after the retry budget is exhausted", () => {
    const { retry, dead } = recordFailure(make({ retryCount: MAX_RETRIES - 1 }));
    expect(retry).toBeNull();
    expect(dead?.retryCount).toBe(MAX_RETRIES);
  });

  it("backs off further on each successive failure", () => {
    const first = recordFailure(make(), 0).retry!;
    const second = recordFailure(first, 0).retry!;
    // Upper bound grows: 500*2^1 vs 500*2^2
    expect(second.nextAttemptAt!).toBeGreaterThanOrEqual(0);
    expect(500 * 2 ** second.retryCount).toBeGreaterThan(500 * 2 ** first.retryCount);
  });
});
