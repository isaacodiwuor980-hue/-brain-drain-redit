import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { idb } from "@/lib/db";
import { useEffect } from "react";
export type { Community } from "@/lib/types";
import type { Community } from "@/lib/types";

const STORE = "communities";

export type JoinStatus = "not_member" | "member" | "pending" | "restricted";

export function useCommunities() {
  const queryClient = useQueryClient();

  const { data: communities = [], isLoading } = useQuery<Community[]>({
    queryKey: [STORE],
    queryFn: () => idb.getAll<Community>(STORE),
  });

  const { mutateAsync: addCommunity } = useMutation({
    mutationFn: async (community: Community) => {
      await idb.put(STORE, community);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [STORE] }),
  });

  // ── B/C: Join flow ──────────────────────────────────────────────
  // Public circles: immediate membership.
  // Restricted circles: sets status to "pending" (request to join).
  // Private circles: not joinable from the UI (invite-only).
  // Duplicate prevention: if already member/pending, the mutation is a no-op.
  const { mutateAsync: joinCommunity, isPending: isJoining } = useMutation({
    mutationFn: async (communityId: string) => {
      const community = await idb.get<Community>(STORE, communityId);
      if (!community) throw new Error("Circle not found");

      // Duplicate prevention — no-op if already member or pending.
      if (community.joinStatus === "member" || community.joinStatus === "pending") {
        return;
      }

      const privacy = community.privacy ?? "public";
      let updated: Community;

      if (privacy === "restricted") {
        // Approval-based: set to pending.
        updated = {
          ...community,
          joinStatus: "pending",
          joinRequestedAt: Date.now(),
        };
      } else if (privacy === "private") {
        // Private: can't join without an invite.
        throw new Error("This circle is invite-only. Ask an admin for an invitation.");
      } else {
        // Public: immediate membership.
        updated = {
          ...community,
          isJoined: true,
          joinStatus: "member",
          memberCount: (community.memberCount || 0) + 1,
        };
      }

      await idb.put(STORE, updated);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [STORE] }),
  });

  // ── C: Cancel join request (for pending status on restricted circles) ──
  const { mutateAsync: cancelJoinRequest, isPending: isCancelling } = useMutation({
    mutationFn: async (communityId: string) => {
      const community = await idb.get<Community>(STORE, communityId);
      if (!community || community.joinStatus !== "pending") return;
      const updated: Community = {
        ...community,
        joinStatus: "not_member",
        joinRequestedAt: undefined,
      };
      await idb.put(STORE, updated);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [STORE] }),
  });

  // ── D: Leave flow ───────────────────────────────────────────────
  // Removes membership, decrements member count, preserves authored posts
  // (posts stay in IDB with their original communityId — they're not deleted).
  const { mutateAsync: leaveCommunity, isPending: isLeaving } = useMutation({
    mutationFn: async (communityId: string) => {
      const community = await idb.get<Community>(STORE, communityId);
      if (!community || community.joinStatus !== "member") return;
      const updated: Community = {
        ...community,
        isJoined: false,
        joinStatus: "not_member",
        memberCount: Math.max(0, (community.memberCount || 0) - 1),
      };
      await idb.put(STORE, updated);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [STORE] }),
  });

  // Approve a pending request (admin action — for restricted circles).
  const { mutateAsync: approveJoinRequest } = useMutation({
    mutationFn: async (communityId: string) => {
      const community = await idb.get<Community>(STORE, communityId);
      if (!community || community.joinStatus !== "pending") return;
      const updated: Community = {
        ...community,
        isJoined: true,
        joinStatus: "member",
        joinRequestedAt: undefined,
        memberCount: (community.memberCount || 0) + 1,
      };
      await idb.put(STORE, updated);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [STORE] }),
  });

  useEffect(() => {
    const seed = async () => {
      const existing = await idb.getAll(STORE);
      if (existing.length === 0) {
        const seedData: Community[] = [
          { id: "c1", name: "AI Safety", description: "Discussing the safety and alignment of AGI.", memberCount: 1250, active: true, icon: "shield", privacy: "public", joinStatus: "not_member", tags: ["ai", "safety", "alignment"] },
          { id: "c2", name: "Medical Diagnosis", description: "Using brains for differential diagnosis.", memberCount: 840, active: true, icon: "stethoscope", privacy: "restricted", joinStatus: "not_member", tags: ["medical", "health", "diagnosis"] },
          { id: "c3", name: "Game Dev", description: "Creating game logic with brains.", memberCount: 300, active: false, icon: "gamepad", privacy: "public", joinStatus: "not_member", tags: ["gamedev", "logic", "design"] },
          { id: "c4", name: "Philosophy", description: "Epistemology and ontology.", memberCount: 150, active: true, icon: "book", privacy: "public", joinStatus: "not_member", tags: ["philosophy", "epistemology"] },
          { id: "c5", name: "Founders Circle", description: "Private circle for verified startup founders.", memberCount: 42, active: true, icon: "shield", privacy: "private", joinStatus: "not_member", tags: ["startups", "founders"] },
        ];
        await idb.putAll(STORE, seedData);
        queryClient.invalidateQueries({ queryKey: [STORE] });
      }
    };
    seed();
  }, [queryClient]);

  return {
    communities,
    isLoading,
    addCommunity,
    joinCommunity,
    leaveCommunity,
    cancelJoinRequest,
    approveJoinRequest,
    isJoining,
    isLeaving,
    isCancelling,
  };
}
