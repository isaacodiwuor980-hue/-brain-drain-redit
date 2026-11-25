import { describe, expect, it } from "vitest";
import { reconcileSyncBatch, type QueuedAction } from "./offline-sync";

const action = (id: string, postId = id): QueuedAction => ({
  id, type: "post_reaction", payload: { postId, reactionType: "upvote" }, createdAt: 1, retryCount: 0,
});

describe("offline replay reconciliation", () => {
  it("keeps a new action added while a successful batch was running", () => {
    expect(reconcileSyncBatch([action("old"), action("new")], ["old"], [], [])).toEqual([action("new")]);
  });
  it("does not resurrect a failed action coalesced into a newer edit", () => {
    const newer = action("new", "same-post");
    const retry = { ...action("old", "same-post"), retryCount: 1, nextAttemptAt: 500 };
    expect(reconcileSyncBatch([newer], [], [retry], [])).toEqual([newer]);
  });
  it("updates a still-present failed action and removes only quarantined ids", () => {
    const retry = { ...action("retry"), retryCount: 1, nextAttemptAt: 500 };
    expect(reconcileSyncBatch([action("retry"), action("dead"), action("waiting")], [], [retry], ["dead"])).toEqual([retry, action("waiting")]);
  });
});

describe("account-scoped offline queues", () => {
  it("keeps held reactions separate across users and legacy work", async () => {
    const { enqueueAction, actionsForOwner } = await import("./offline-sync");
    const base = { type: "post_reaction" as const, payload: { postId: "same", reactionType: "upvote" } };
    let queue = enqueueAction([], base);
    queue = enqueueAction(queue, { ...base, ownerId: "alice" });
    queue = enqueueAction(queue, { ...base, ownerId: "bob" });
    queue = enqueueAction(queue, { ...base, ownerId: "unscoped" });
    expect(queue).toHaveLength(4);
    expect(actionsForOwner(queue, undefined)).toEqual([]);
    expect(actionsForOwner(queue, "alice")).toHaveLength(1);
    expect(actionsForOwner(queue, "bob")).toHaveLength(1);
    expect(actionsForOwner(queue, "alice")[0].ownerId).toBe("alice");
    const latest = enqueueAction(queue, { ...base, ownerId: "alice" });
    expect(latest).toHaveLength(5);
    expect(actionsForOwner(latest, "alice")).toHaveLength(2);
    expect(reconcileSyncBatch(latest, [queue[1].id], [], [])).toEqual(latest.filter(item => item.id !== queue[1].id));
  });
});
