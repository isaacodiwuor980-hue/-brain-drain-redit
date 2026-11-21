import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { idb } from "@/lib/db";
import { Topic } from "@/lib/types";
import { env } from "@/lib/env";
import { fetchTopics, createTopic as createTopicApi, followTopic } from "@/lib/api/topics";
import { getAuthToken } from "@/lib/auth-token";

function sortTopics(topics: Topic[]): Topic[] {
  return [...topics].sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : 999999;
    const orderB = b.order !== undefined ? b.order : 999999;
    return orderA - orderB;
  });
}

function mergeCloudWithLocal(cloudTopics: Topic[], localTopics: Topic[]): Topic[] {
  const cloudIds = new Set(cloudTopics.map((t) => t.id));
  const localOnly = localTopics.filter((t) => !cloudIds.has(t.id));
  return sortTopics([...cloudTopics, ...localOnly]);
}

export function useTopics() {
  const queryClient = useQueryClient();

  const { data: topics = [], isLoading } = useQuery<Topic[]>({
    queryKey: ["topics"],
    staleTime: 60_000,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const cached = sortTopics(await idb.getAll<Topic>("topics"));

      // Same-origin API when VITE_API_BASE_URL is empty — see lib/env.ts.
      if (!env.apiEnabled) {
        return cached;
      }

      try {
        const response = await fetchTopics();
        // PREVIEW FIX (same as use-social): the cache write is wrapped
        // separately — an IDB write failure (storage blocked in sandboxed
        // preview iframe / Safari ITP, or quota) must NEVER discard the
        // cloud topics we just fetched.
        if (response.topics.length > 0) {
          try {
            await idb.putAll("topics", response.topics);
          } catch (idbErr) {
            console.warn("[topics] Could not cache topics locally (cloud data still shown)", idbErr);
          }
        }
        return mergeCloudWithLocal(response.topics, cached);
      } catch {
        return cached;
      }
    },
  });

  const addTopicMutation = useMutation({
    mutationFn: async (topic: Topic) => {
      await idb.put("topics", topic);

      // Same-origin API when VITE_API_BASE_URL is empty — see lib/env.ts.
      if (!env.apiEnabled) return;

      try {
        const token = await getAuthToken();
        // GUEST FIX: no session → local-only (same contract as use-social).
        // Previously guest topic seeds hit POST /api/topics → 401 spam and
        // unnecessary rate-limiter load.
        if (!token) return;
        await createTopicApi(
          {
            id: topic.id,
            name: topic.name,
            description: topic.description,
            category: topic.category,
          },
          token,
        );
      } catch {
        // There is no retry queue here. Do not promise a future sync or log
        // upstream error details (a conflict, for example, needs resolution).
        console.warn("Topic cloud creation failed; the local topic may not sync.");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["topics"] });
    },
  });

  const reorderTopicsMutation = useMutation({
    mutationFn: async (orderedTopics: Topic[]) => {
      // Persist ordering in a single transaction.
      const reordered = orderedTopics.map((topic, i) => ({ ...topic, order: i }));
      await idb.putAll("topics", reordered);
      // Topic ordering is a local preference for now; a future endpoint can
      // persist per-user ordering to the cloud.
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["topics"] });
    },
  });

  const followTopicMutation = useMutation({
    mutationFn: async ({ topicId, shouldFollow }: { topicId: string; shouldFollow: boolean }) => {
      // Mark followed/unfollowed locally so the UI updates immediately.
      const topic = await idb.get<Topic>("topics", topicId);
      if (topic) {
        const updated: Topic = { ...topic, isFollowed: shouldFollow };
        if (typeof topic.followerCount === "number") {
          updated.followerCount = Math.max(
            0,
            topic.followerCount + (shouldFollow ? 1 : -1),
          );
        }
        await idb.put("topics", updated);
      }
      // Best-effort cloud sync. The backend currently only exposes "follow";
      // unfollow degrades gracefully — the local state is the source of truth
      // for the current user's followed topics.
      if (env.apiEnabled && shouldFollow) {
        const token = await getAuthToken();
        await followTopic(topicId, token);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["topics"] });
    },
  });

  return {
    topics,
    isLoading,
    addTopic: addTopicMutation.mutateAsync,
    reorderTopics: reorderTopicsMutation.mutateAsync,
    followTopic: (topicId: string, shouldFollow: boolean = true) =>
      followTopicMutation.mutateAsync({ topicId, shouldFollow }),
    refreshTopics: () => queryClient.invalidateQueries({ queryKey: ["topics"] }),
  };
}
