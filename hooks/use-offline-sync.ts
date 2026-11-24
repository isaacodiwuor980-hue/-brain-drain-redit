import { useState, useEffect, useCallback, useRef } from "react";
import {
  getOfflineQueue,
  actionsForOwner,
  getDeadLetterQueue,
  partitionDueActions,
  quarantineActions,
  quarantineOutcome,
  recordFailure,
  reconcileSyncBatch,
  saveOfflineQueue,
  QueuedAction,
} from "@/lib/offline-sync";
import { useOnlineStatus } from "./use-online-status";
import { triggerHaptic } from "@/lib/device";
import { useToast } from "./use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { idb } from "@/lib/db";
import { env } from "@/lib/env";
import { getAuthSession } from "@/lib/auth-token";
import { useAuth } from "@/components/auth/AuthContext";
import { createPost, reactToPost, toCreatePostInput } from "@/lib/api/feed";
import { saveBrain } from "@/lib/api/brains";
import type { Post, Brain, Node } from "@/lib/types";

export function useOfflineSync() {
  const status = useOnlineStatus();
  const isOnline = status === "online";
  const [queue, setQueue] = useState<QueuedAction[]>(getOfflineQueue);
  const [isSyncing, setIsSyncing] = useState(false);
  const [authRetryAt, setAuthRetryAt] = useState(0);
  const syncingRef = useRef(false);
  const { user } = useAuth();
  const currentUserId = user?.uid;
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
    if (currentQueue.length === 0 || !isOnline || syncingRef.current) return;
    if (!env.apiEnabled) {
      // A local-only build cannot replay these actions. Preserve them for a
      // later cloud-enabled session rather than silently discarding work.
      return;
    }

    // Never replay a different user's work or legacy entries with no owner.
    if (!currentUserId) return;
    const { due } = partitionDueActions(actionsForOwner(currentQueue, currentUserId));
    if (due.length === 0) return;
    const session = await getAuthSession().catch(() => null);
    if (!session?.token || session.uid !== currentUserId) {
      setAuthRetryAt(Date.now() + 30_000);
      return;
    }
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      triggerHaptic("medium");

      const succeeded: string[] = [];
      const retries: QueuedAction[] = [];
      const dead: QueuedAction[] = [];
      let skipped = 0;

      // HARDENED: only replay actions whose jittered backoff has elapsed.
      // Actions still waiting are carried over untouched — so a burst of
      // failures can't spin the loop or hammer a struggling API.
      for (const action of due) {
        const active = await getAuthSession().catch(() => null);
        if (!active?.token || active.uid !== currentUserId) {
          setAuthRetryAt(Date.now() + 30_000);
          break;
        }
        try {
          const result = await replayAction(action, active.token);
          succeeded.push(action.id);
          if (result === "skipped") skipped++;
        } catch {
          const { retry, dead: quarantined } = recordFailure(action);
          if (quarantined) {
            // Do not log request identifiers, payloads or upstream errors.
            console.warn("An offline action needs attention after repeated failures.");
            dead.push(quarantined);
          } else if (retry) {
            retries.push(retry);
          }
        }
      }

      // An enqueue may have happened during the network requests. Re-read the
      // queue and only update entries that are still present by their unique id.
      const latest = getOfflineQueue();
      const latestIds = new Set(latest.map((action) => action.id));
      const stillDead = dead.filter((action) => latestIds.has(action.id));
      const stored = quarantineActions(stillDead);
      const {deadIds, held} = quarantineOutcome(stillDead, stored);
      const nextQueue = reconcileSyncBatch(latest, succeeded, [...retries, ...held], deadIds);
      saveOfflineQueue(nextQueue);
      setQueue(nextQueue);

      const syncedCount = succeeded.length - skipped;

      if (nextQueue.length === 0 && stillDead.length === 0) {
        triggerHaptic("success");
        toast({
          title: "Sync complete",
          description: `${syncedCount} offline item${syncedCount === 1 ? "" : "s"} synced${skipped > 0 ? ` (${skipped} remained local or required no replay)` : ""}.`,
        });
        void queryClient.invalidateQueries({ queryKey: ["posts"] });
        void queryClient.invalidateQueries({ queryKey: ["profile"] });
        void queryClient.invalidateQueries({ queryKey: ["missions"] });
        void queryClient.invalidateQueries({ queryKey: ["brains"] });
      } else {
        triggerHaptic("warning");
        toast({
          title: "Sync partially complete",
          description: !stored && stillDead.length
            ? "Some items could not be moved to recovery storage and remain pending. Avoid clearing browser data."
            : `${syncedCount} synced; ${nextQueue.length} pending${stillDead.length ? `, ${stillDead.length} need attention` : ""}.`,
          variant: "destructive",
        });
      }
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [isOnline, currentUserId, toast, queryClient]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (!isOnline || isSyncing || !currentUserId || !env.apiEnabled) return;
    // Held items require manual attention and must not schedule an overflowing
    // browser timeout or be automatically replayed.
    const eligible = actionsForOwner(queue, currentUserId).filter(action => action.nextAttemptAt !== Number.MAX_SAFE_INTEGER);
    if (eligible.length === 0) return;
    const nextAt = Math.min(...eligible.map((action) => action.nextAttemptAt ?? 0));
    const delay = Math.max(0, nextAt - Date.now(), authRetryAt - Date.now());
    const timer = window.setTimeout(() => { void syncNow(); }, delay);
    return () => window.clearTimeout(timer);
  }, [isOnline, isSyncing, queue, currentUserId, authRetryAt, syncNow]);

  return {
    isOnline,
    pendingCount: queue.length,
    /** Actions that exhausted their retry budget (need attention). */
    deadLetterCount: getDeadLetterQueue().length,
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
        toCreatePostInput(post),
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
