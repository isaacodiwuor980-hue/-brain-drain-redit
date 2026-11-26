import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Reputation, XPEvent } from "../lib/types";
import { idb } from "../lib/db";

const XP_PER_LEVEL = 200;

export function useReputation() {
  const queryClient = useQueryClient();

  const { data: { reputation = null, xpEvents = [] } = {}, isLoading } = useQuery({
    queryKey: ["reputationData"],
    queryFn: async () => {
      let rep = await idb.get<Reputation>("reputation", "me");
      if (!rep) {
        rep = {
          id: "me",
          xp: 0,
          level: 1,
          streak: 0,
          lastActiveDate: "",
          totalMissionsCompleted: 0,
          totalMindsCreated: 0,
          totalCheckIns: 0,
          badges: []
        };
        await idb.put("reputation", rep);
      }

      const events = await idb.getAll<XPEvent>("xp_events");
      return {
        reputation: rep,
        xpEvents: events.sort((a, b) => b.createdAt - a.createdAt)
      };
    }
  });

  const addXPEventMutation = useMutation({
    mutationFn: async ({ type, xpGained, description }: { type: XPEvent["type"], xpGained: number, description: string }) => {
      const event: XPEvent = {
        id: crypto.randomUUID(),
        type,
        xpGained,
        description,
        createdAt: Date.now(),
      };

      await idb.put("xp_events", event);

      // Re-read the latest reputation from IDB inside the mutationFn so
      // rapid sequential calls don't lose XP via stale-closure overwrites.
      let rep = await idb.get<Reputation>("reputation", "me");
      if (!rep) {
        rep = {
          id: "me",
          xp: 0,
          level: 1,
          streak: 0,
          lastActiveDate: "",
          totalMissionsCompleted: 0,
          totalMindsCreated: 0,
          totalCheckIns: 0,
          badges: [],
        };
      }

      const newXp = rep.xp + xpGained;
      const newLevel = Math.min(100, Math.floor(newXp / XP_PER_LEVEL) + 1);

      const updatedRep: Reputation = {
        ...rep,
        xp: newXp,
        level: newLevel,
      };

      // Update specific counters
      if (type === "mission_completed") updatedRep.totalMissionsCompleted++;
      if (type === "mind_created") updatedRep.totalMindsCreated++;
      if (type === "check_in") updatedRep.totalCheckIns++;

      // Compute badges
      const newBadges = [...rep.badges];
      if (updatedRep.totalMindsCreated >= 1 && !newBadges.includes("First Mind")) {
        newBadges.push("First Mind");
      }
      if (updatedRep.streak >= 7 && !newBadges.includes("Streak 7")) {
        newBadges.push("Streak 7");
      }
      if (updatedRep.level >= 10 && !newBadges.includes("Level 10")) {
        newBadges.push("Level 10");
      }
      updatedRep.badges = newBadges;

      await idb.put("reputation", updatedRep);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reputationData"] });
    }
  });

  const updateStreakMutation = useMutation({
    mutationFn: async () => {
      // Re-read inside the mutationFn to avoid stale-closure overwrites.
      const rep = await idb.get<Reputation>("reputation", "me");
      if (!rep) return;

      const today = new Date().toISOString().split("T")[0];
      if (rep.lastActiveDate === today) return;

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      let newStreak = rep.streak;
      if (rep.lastActiveDate === yesterdayStr) {
        newStreak += 1;
      } else if (rep.lastActiveDate === "") {
        newStreak = 1;
      } else {
        newStreak = 1; // Reset if missed a day
      }

      const updatedRep: Reputation = {
        ...rep,
        streak: newStreak,
        lastActiveDate: today
      };

      await idb.put("reputation", updatedRep);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reputationData"] });
    }
  });

  const mutateStreak = updateStreakMutation.mutate;

  useEffect(() => {
    if (reputation && !reputation.lastActiveDate.includes(new Date().toISOString().split("T")[0])) {
      mutateStreak();
    }
  }, [reputation, reputation?.lastActiveDate, mutateStreak]);

  return {
    reputation,
    xpEvents,
    addXPEvent: (type: XPEvent["type"], xpGained: number, description: string) => addXPEventMutation.mutateAsync({ type, xpGained, description }),
    updateStreak: updateStreakMutation.mutateAsync,
    isLoading
  };
}
