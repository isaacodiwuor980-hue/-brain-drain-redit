import { useQuery } from "@tanstack/react-query";
import type { Reputation, XPEvent } from "../lib/types";
import { idb } from "../lib/db";

/** Read historical local values only. These are not authoritative or account-scoped. */
export function useReputation() {
  const { data: { reputation = null, xpEvents = [] } = {}, isLoading } = useQuery({
    queryKey: ["reputationData"],
    queryFn: async () => {
      const rep = await idb.get<Reputation>("reputation", "me");
      const events = await idb.getAll<XPEvent>("xp_events");
      return { reputation: rep ?? null, xpEvents: events.sort((a, b) => b.createdAt - a.createdAt) };
    },
  });

  // Reject explicitly rather than reporting a reward or changing balances.
  const addXPEvent = async (type: XPEvent["type"], _xpGained: number, _description: string): Promise<void> => {
    throw new Error(type === "vote_bonus" ? "Vote rewards unavailable" : "Points temporarily unavailable");
  };
  const updateStreak = async (): Promise<void> => { throw new Error("Streak changes temporarily unavailable"); };

  return { reputation, xpEvents, addXPEvent, updateStreak, isLoading };
}
