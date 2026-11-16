/**
 * use-discover.ts — Phase 3 (Topic Suggestions) + Phase 4 (Username Search)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth-token";
import { useAuth } from "@/components/auth/AuthContext";

export interface SuggestedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followerCount: number;
  overlap: number;
}

export interface UserSearchResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followerCount: number;
}

function isGuest(user: { id: string } | null): boolean {
  return !user || user.id.startsWith("guest-");
}

/** Phase 3 — users who follow the same topics, ranked by overlap. */
export function useDiscoverByTopics(limit = 20) {
  const { user } = useAuth();
  const guest = isGuest(user);
  return useQuery<SuggestedUser[]>({
    queryKey: ["discover", "by-topics", limit, user?.id],
    queryFn: async () => {
      if (guest) return [];
      const token = await getAuthToken();
      if (!token) return [];
      const res = await fetch(`/api/discover/by-topics?limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.suggestions ?? [];
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: !guest,
  });
}

/** Current user's follower count (gates the PeopleYouMayKnow widget). */
export function useFollowerCount() {
  const { user } = useAuth();
  const guest = isGuest(user);
  return useQuery<number>({
    queryKey: ["discover", "follower-count", user?.id],
    queryFn: async () => {
      if (guest) return 0;
      const token = await getAuthToken();
      if (!token) return 0;
      const res = await fetch("/api/discover/follower-count", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return 0;
      const data = await res.json();
      return data.followerCount ?? 0;
    },
    staleTime: 60 * 1000,
    enabled: !guest,
  });
}

/** Follow a user. Invalidates discover queries on success. */
export function useFollowUser() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const guest = isGuest(user);
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (guest) throw new Error("Sign in to follow users");
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/discover/follow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: targetUserId }),
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`Failed to follow user (status ${res.status})`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discover"] });
    },
  });
}

/** Phase 4 — debounced username search. Requires 3+ chars. */
export function useUserSearch(query: string) {
  const trimmed = query.trim();
  const shouldQuery = trimmed.length >= 3;
  return useQuery<UserSearchResult[]>({
    queryKey: ["user-search", trimmed],
    queryFn: async () => {
      if (!shouldQuery) return [];
      const res = await fetch(`/api/discover/search-users?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.results ?? [];
    },
    staleTime: 30 * 1000,
    enabled: shouldQuery,
  });
}
