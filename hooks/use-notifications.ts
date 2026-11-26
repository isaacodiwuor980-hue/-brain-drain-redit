import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { idb } from "@/lib/db";
import { getAnalyticsEvents, trackEvent } from "@/lib/analytics";
import { rankNotificationsByRelevance } from "@/lib/recommendations";
import { Notification } from "@/lib/types";
import { useEffect, useCallback } from "react";

const STORE = "notifications";

export function useNotifications() {
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: [STORE],
    queryFn: async () => {
      const allNotifications = await idb.getAll<Notification>(STORE);
      const analyticsEvents = await getAnalyticsEvents();
      return rankNotificationsByRelevance(allNotifications, analyticsEvents);
    },
  });

  const { mutateAsync: markAsRead } = useMutation({
    mutationFn: async (id: string) => {
      const notification = await idb.get<Notification>(STORE, id);
      if (notification) {
        await idb.put(STORE, { ...notification, read: true });
        // F5: fire-and-forget the analytics call. Previously this was
        // `await trackEvent(...)` — if the analytics POST failed (network
        // error, 502, etc.), the entire mutation rejected, onError fired,
        // onSuccess (cache invalidation) never ran, and the notification
        // stayed "unread" in the UI even though IDB had it marked read.
        // Analytics is best-effort; the read-state write is the source of
        // truth and must not be coupled to telemetry success.
        trackEvent("notification_opened", {
          notificationId: id,
          type: notification.type,
          hadPostId: Boolean(notification.postId),
        }).catch(() => {
          // Silently ignore — analytics failure must not affect UX.
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [STORE] });
    },
  });

  const { mutateAsync: markAllAsRead } = useMutation({
    mutationFn: async () => {
      const all = await idb.getAll<Notification>(STORE);
      const unread = all.filter((n) => !n.read).map((n) => ({ ...n, read: true }));
      await idb.putAll(STORE, unread);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [STORE] });
    },
  });

  /**
   * Task 14: create a real notification. Used by other hooks (comments,
   * reactions, mind-run) to generate notifications when events happen.
   * Previously the only notifications were static seed data — clicking a
   * "reply" notification went to "/" because the seed had no postId.
   */
  const createNotification = useCallback(async (input: Omit<Notification, "id" | "createdAt" | "read"> & { read?: boolean }) => {
    const notif: Notification = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      read: input.read ?? false,
    };
    await idb.put(STORE, notif);
    queryClient.invalidateQueries({ queryKey: [STORE] });
    return notif.id;
  }, [queryClient]);

  // Seed data — includes postId on reply/reaction notifications so
  // click-through takes the user to the actual post (Task 14 fix).
  useEffect(() => {
    const seed = async () => {
      const existing = await idb.getAll(STORE);
      if (existing.length === 0) {
        const seedData: Notification[] = [
          {
            id: "notif-1",
            type: "reply",
            actorName: "Sarah Chen",
            content: "replied to your post in 'AI Safety'",
            read: false,
            postId: "demo-post-1",
            createdAt: Date.now() - 1000 * 60 * 5,
          },
          {
            id: "notif-2",
            type: "mention",
            actorName: "Marcus Wright",
            content: "mentioned you in a comment",
            read: false,
            postId: "demo-post-1",
            createdAt: Date.now() - 1000 * 60 * 60,
          },
          {
            id: "notif-3",
            type: "reaction",
            actorName: "Elena Rodriguez",
            content: "loved your mind 'Medical Diagnosis'",
            read: true,
            postId: "demo-post-2",
            createdAt: Date.now() - 1000 * 60 * 60 * 2,
          },
          {
            id: "notif-4",
            type: "mind_run",
            actorName: "Anonymous",
            content: "ran your 'Coffee Recommender' mind",
            read: false,
            createdAt: Date.now() - 1000 * 60 * 60 * 5,
          },
          {
            id: "notif-5",
            type: "reply",
            actorName: "David Kim",
            content: "replied to your comment",
            read: true,
            postId: "demo-post-1",
            createdAt: Date.now() - 1000 * 60 * 60 * 24,
          },
        ];

        await idb.putAll(STORE, seedData);
        queryClient.invalidateQueries({ queryKey: [STORE] });
      }
    };
    seed();
  }, [queryClient]);

  return {
    notifications,
    isLoading,
    markAsRead,
    markAllAsRead,
    createNotification,
  };
}
