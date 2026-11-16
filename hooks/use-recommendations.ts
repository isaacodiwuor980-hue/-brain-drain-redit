import { useQuery } from "@tanstack/react-query";
import { getAnalyticsEvents } from "@/lib/analytics";

export function useAnalyticsEvents() {
  return useQuery({
    queryKey: ["analytics_events"],
    queryFn: getAnalyticsEvents,
    staleTime: 60_000, // 1 minute — events don't change fast enough to justify 30s refetches
    // PERF: removed refetchInterval: 30_000. The old 30s refetch caused
    // getAll("analytics_events") + buildTopicScores() to re-run every 30s
    // even when the user was just reading. This was the #1 ongoing CPU sink.
    // The query still refetches on mutation invalidation (trackEvent calls
    // invalidate the query), so the feed stays fresh after user actions.
  });
}
