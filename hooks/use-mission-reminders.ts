import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { idb } from "@/lib/db";
import { getAnalyticsEvents, trackEvent } from "@/lib/analytics";
import { rankMissionReminders } from "@/lib/recommendations";
import { Mission } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useVisibleInterval } from "@/hooks/use-visible-interval";

export function useMissionReminders() {
  const { toast } = useToast();

  const { data: missions = [] } = useQuery({
    queryKey: ["missions"],
    queryFn: async () => {
      const allMissions = await idb.getAll<Mission>("missions");
      return allMissions;
    }
  });

  const checkReminders = useCallback(async () => {
    if (!missions.length) return;

    const rankedActiveMissions = rankMissionReminders(missions, await getAnalyticsEvents());
    const now = Date.now();
    const REVIEW_INTERVAL = 4 * 60 * 60 * 1000;

    for (const mission of rankedActiveMissions.slice(0, 2)) {
      let lastNotified: string | null;
      try {
        lastNotified = localStorage.getItem(`mission_notified_${mission.id}`);
      } catch {
        lastNotified = null;
      }

      const alreadyNotified = lastNotified !== null && (now - parseInt(lastNotified, 10) <= REVIEW_INTERVAL);
      if (!lastNotified || !alreadyNotified) {
        toast({
          title: `Review Period: ${mission.title}`,
          description: "Consistent progress builds pathways. Time for your review!",
          duration: 8000,
        });
        try {
          localStorage.setItem(`mission_notified_${mission.id}`, now.toString());
        } catch {
          // Ignore — best-effort throttle.
        }
        void trackEvent("mission_reminder", {
          missionId: mission.id,
          category: mission.category,
          progress: mission.progress,
          hasTargetDate: Boolean(mission.targetDate),
        });
        break;
      }
    }
  }, [missions, toast]);

  // Check immediately on mount/data load.
  useEffect(() => {
    void checkReminders();
  }, [checkReminders]);

  // Then check periodically — but ONLY when the tab is visible.
  // useVisibleInterval pauses when the user switches away, saving
  // battery on mobile. The old code used a raw setInterval that ran
  // every 10 minutes even in a background tab, keeping the CPU awake.
  useVisibleInterval(() => void checkReminders(), 10 * 60 * 1000);
}
