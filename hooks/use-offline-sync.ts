import { useState, useEffect, useCallback } from "react";
import { getOfflineQueue, QueuedAction, saveOfflineQueue } from "@/lib/offline-sync";
import { useOnlineStatus } from "./use-online-status";
import { triggerHaptic } from "@/lib/device";
import { useToast } from "./use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { idb } from "@/lib/db";
import { env } from "@/lib/env";
import { getAuthToken } from "@/lib/auth-token";
import { createPost, reactToPost } from "@/lib/api/feed";
import { saveBrain } from "@/lib/api/brains";
import type { Post, Brain, Node } from "@/lib/types";

export function useOfflineSync() {
  const status = useOnlineStatus();
  const isOnline = status === "online";
  const [queue, setQueue] = useState<QueuedAction[]>(getOfflineQueue);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Listen to queue changes
  useEffect(() => {
    const handleQueueChange = () => {
      setQueue(getOfflineQueue());
    };
    window.addEventListener("brainbuilder_queue_change", handleQueueChange);
    return () => window.removeEventListener("brainbuilder_queue_change", handleQueueChange);
  }, []);

  /**
   * BUG-003 FIX: Real offline sync replay.
   *
   * Previously this function did `setTimeout(800); clearOfflineQueue()` — a
   * FAKE sync that silently discarded every queued action. Offline posts and
   * reactions were lost when the user came back online.
   *
   * Now: replay each queued action by calling the corresponding API. Actions
   * that succeed are removed from the queue. Actions that fail are kept with
   * an incremented retryCount (max 5 retries before they're dropped to avoid
   * an unbounded poison-queue). Actions with no server equivalent
   * (add_comment, save_profile) are treated as auto-success (they're already
   * saved in IDB and have no REST endpoint to sync to).
   */
  const syncNow = useCallback(async () => {
    const currentQueue = getOfflineQueue();
    if (currentQueue.length === 0 || !isOnline || isSyncing) return;
    if (!env.apiEnabled) {
      // Local-only build (VITE_LOCAL_ONLY=1) — nothing to sync to. Clear the
      // queue so it doesn't grow unbounded in local-only mode.
      saveOfflineQueue([]);
      setQueue([]);
      return;
    }

    setIsSyncing(true);
    triggerHaptic("medium");

    const token = await getAuthToken().catch(() => null);
    const succeeded: string[] = [];
    const failed: QueuedAction[] = [];
    let skipped = 0;

    for (const action of currentQueue) {
      try {
        const result = await replayAction(action, token);
        if (result === "skipped") {
          skipped++;
          succeeded.push(action.id); // remove from queue — no point retrying
        } else {
          succeeded.push(action.id);
        }
      } catch (err) {
        // Keep the action for retry, but cap retries at 5 to avoid a
        // poison-queue that never drains.
        const retryCount = action.retryCount + 1;
        if (retryCount >= 5) {
          // Drop permanently — log but don't block the rest of the queue.
          console.warn(`Offline action ${action.id} (${action.type}) dropped after 5 retries:`, err);
          succeeded.push(action.id); // remove from queue
        } else {
          failed.push({ ...action, retryCount });
        }
      }
    }

    // Rebuild the queue: keep only failed actions.
    const remaining = currentQueue.filter((a) => !succeeded.includes(a.id));
    // Merge with failed actions that have updated retryCounts.
    const nextQueue = remaining.map(
      (a) => failed.find((f) => f.id === a.id) || a,
    );
    saveOfflineQueue(nextQueue);
    setQueue(nextQueue);

    const syncedCount = succeeded.length - skipped;

    if (failed.length === 0) {
      triggerHaptic("success");
      toast({
        title: "All changes synced",
        description: `${syncedCount} offline item${syncedCount === 1 ? "" : "s"} synced${skipped > 0 ? ` (${skipped} already saved locally)` : ""}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: ["missions"] });
      void queryClient.invalidateQueries({ queryKey: ["brains"] });
    } else {
      triggerHaptic("warning");
      toast({
        title: "Sync partially complete",
        description: `${syncedCount} synced, ${failed.length} will retry next time.`,
        variant: "destructive",
      });
    }
    setIsSyncing(false);
  }, [isOnline, isSyncing, toast, queryClient]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && queue.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate external-trigger sync: auto-flush the offline queue when connectivity returns; refactoring to derived state would change behavior (syncNow drives IDB + network writes + toast side effects).
      void syncNow();
    }
  }, [isOnline, queue.length, syncNow]);

  return {
    isOnline,
    pendingCount: queue.length,
    isSyncing,
    syncNow,
  };
}

/**
 * Replays a single queued action by calling the corresponding API.
 * Returns "synced" on success, "skipped" for actions with no server endpoint.
 * Throws on failure so the caller can retry.
 */
async function replayAction(
  action: QueuedAction,
  token: string | null,
): Promise<"synced" | "skipped"> {
  switch (action.type) {
    case "create_post": {
      // The queue payload only has { postId } — read the full post from IDB.
      const postId = action.payload?.postId as string | undefined;
      if (!postId) return "skipped";
      const post = await idb.get<Post>("posts", postId);
      if (!post) {
        // Post was deleted locally before sync — nothing to send.
        return "skipped";
      }
      await createPost(
        {
          id: post.id,
          topicId: post.topicId,
          content: post.content,
          postType: post.postType,
          event: post.event,
          mediaUrls: post.mediaUrls,
          brainId: post.brainId,
          createdAt: post.createdAt,
        },
        token,
      );
      return "synced";
    }

    case "post_reaction": {
      const { postId, reactionType } = (action.payload || {}) as {
        postId?: string;
        reactionType?: "upvote" | "downvote" | "repost";
      };
      if (!postId || !reactionType) return "skipped";
      await reactToPost(postId, reactionType, token);
      return "synced";
    }

    case "update_brain": {
      // Payload should be { brain, nodes } matching UpsertBrainInput.
      const brain = action.payload?.brain as Brain | undefined;
      const nodes = action.payload?.nodes as Node[] | undefined;
      if (!brain || !nodes) return "skipped";
      await saveBrain({ brain: { ...brain, is_public: false }, nodes }, token);
      return "synced";
    }

    case "add_comment":
      // Comments have no server endpoint — they're local-only by design.
      // The comment is already saved in IDB; nothing to sync.
      return "skipped";

    case "save_profile":
      // Profile updates go through Firestore directly (not the REST API),
      // so we can't replay them here. The profile is already saved locally
      // and will sync via Firestore's own offline persistence on next
      // sign-in. Mark as skipped to clear it from the queue.
      return "skipped";

    default:
      return "skipped";
  }
}
