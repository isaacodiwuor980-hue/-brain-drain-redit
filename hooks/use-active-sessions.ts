import { useQuery } from "@tanstack/react-query";
import { RealtimeSession } from "../lib/extension-types";
import { idb } from "../lib/db";

const MOCK_SESSIONS: RealtimeSession[] = [
  {
    id: "session-1",
    title: "Diagnostic Walkthrough: Memory Leaks",
    brainId: "brain-1",
    hostUserId: "u-101",
    communityId: "comm-react",
    status: "active",
    activeNodeId: "node-2",
    participants: {
      "u-101": { userId: "u-101", displayName: "Elena Rostova", role: "host", joinedAt: Date.now() },
      "u-102": { userId: "u-102", displayName: "Marcus Vance", role: "contributor", joinedAt: Date.now() },
    },
    createdAt: Date.now() - 600000,
    updatedAt: Date.now(),
  },
];

export function useActiveSessions() {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["active_realtime_sessions"],
    queryFn: async () => {
      const stored = await idb.getAll<RealtimeSession>("realtime_sessions");
      const active = stored.filter(s => s.status === "active");
      if (active.length > 0) return active;
      
      // Fallback for demonstration
      await idb.putAll("realtime_sessions", MOCK_SESSIONS);
      return MOCK_SESSIONS;
    },
    refetchInterval: 10000, // Refresh every 10s
  });

  return { sessions, isLoading };
}
