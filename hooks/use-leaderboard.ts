import { useQuery } from "@tanstack/react-query";
import { Leaderboard, LeaderboardMetric, LeaderboardTimeframe } from "../lib/extension-types";
import { idb } from "../lib/db";
import { useAuth } from "@/components/auth/AuthContext";
import { userIdOr } from "@/lib/user-data";

const SEED_LEADERBOARDS: Leaderboard[] = [
  {
    id: "weekly_reasoning_xp_global",
    timeframe: "weekly",
    metric: "reasoning_xp",
    updatedAt: Date.now(),
    entries: [
      {
        userId: "u-101",
        username: "elenarostova",
        displayName: "Elena Rostova",
        avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
        rank: 1,
        score: 3450,
        badge: "Architect Prime",
        change24h: 0,
      },
      {
        userId: "u-102",
        username: "drsarahchen",
        displayName: "Dr. Sarah Chen",
        avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&auto=format&fit=crop&q=80",
        rank: 2,
        score: 3120,
        badge: "Diagnostic Master",
        change24h: 1,
      },
      {
        userId: "me",
        username: "you",
        displayName: "You (Explorer)",
        avatarUrl: undefined,
        rank: 3,
        score: 2890,
        badge: "Cognitive Pioneer",
        change24h: 2,
      },
      {
        userId: "u-103",
        username: "marcusvance",
        displayName: "Marcus Vance",
        avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80",
        rank: 4,
        score: 2450,
        badge: "Epistemic Logician",
        change24h: -1,
      },
      {
        userId: "u-104",
        username: "kaitakahashi",
        displayName: "Kai Takahashi",
        avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80",
        rank: 5,
        score: 2180,
        badge: "Graph Weaver",
        change24h: 0,
      },
    ],
  },
  {
    id: "all_time_brains_built_global",
    timeframe: "all_time",
    metric: "brains_built",
    updatedAt: Date.now(),
    entries: [
      {
        userId: "u-101",
        username: "elenarostova",
        displayName: "Elena Rostova",
        rank: 1,
        score: 48,
        badge: "System Creator",
      },
      {
        userId: "u-103",
        username: "marcusvance",
        displayName: "Marcus Vance",
        rank: 2,
        score: 36,
        badge: "Decision Engineer",
      },
      {
        userId: "me",
        username: "you",
        displayName: "You (Explorer)",
        rank: 3,
        score: 19,
        badge: "Graph Builder",
      },
    ],
  },
];

export function useLeaderboard(timeframe: LeaderboardTimeframe = "weekly", metric: LeaderboardMetric = "reasoning_xp") {
  // Phase 2: real user ID for the "you" entry in the leaderboard.
  const { user } = useAuth();
  const currentUserId = userIdOr(user);
  const leaderboardId = `${timeframe}_${metric}_global`;

  const {
    data: leaderboard,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["leaderboard", leaderboardId],
    queryFn: async () => {
      const stored = await idb.get<Leaderboard>("leaderboards", leaderboardId);
      if (stored) return stored;

      // Only persist the seed when its id matches the requested key.
      // The previous code fell back to SEED_LEADERBOARDS[0] (a weekly XP
      // leaderboard) for ANY unknown key, e.g. "daily_reasoning_xp_global",
      // and persisted it under that wrong key — so the daily board was
      // forever polluted with weekly data.
      const fallback = SEED_LEADERBOARDS.find((lb) => lb.id === leaderboardId);
      if (!fallback) {
        // Return a synthesized empty leaderboard so the caller still gets a
        // well-shaped object; do NOT persist it under the requested key.
        return {
          id: leaderboardId,
          timeframe,
          metric,
          updatedAt: Date.now(),
          entries: [],
        } as Leaderboard;
      }
      await idb.put("leaderboards", fallback);
      return fallback;
    },
    staleTime: 1000 * 60 * 10,
    // Phase 2: replace the legacy "me" userId with the real signed-in user ID
    // so the leaderboard's "you" entry reflects the actual user.
    select: (lb: Leaderboard): Leaderboard => {
      if (!lb || currentUserId === "me") return lb;
      return {
        ...lb,
        entries: lb.entries.map((e) =>
          e.userId === "me" ? { ...e, userId: currentUserId } : e
        ),
      };
    },
  });

  return {
    leaderboard,
    entries: leaderboard?.entries || [],
    isLoading,
    refetch,
  };
}
