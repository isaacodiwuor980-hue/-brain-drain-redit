import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mission, Milestone } from "../lib/types";
import { idb } from "../lib/db";
import { useReputation } from "./use-reputation";

export function useMissions() {
  const queryClient = useQueryClient();
  const { addXPEvent } = useReputation();

  const { data: { missions = [], milestones = [] } = {}, isLoading } = useQuery({
    queryKey: ["missionsData"],
    queryFn: async () => {
      const [allMissions, allMilestones] = await Promise.all([
        idb.getAll<Mission>("missions"),
        idb.getAll<Milestone>("milestones")
      ]);

      if (allMissions.length === 0) {
        // Seed initial data
        const seedMissions: Mission[] = [
          {
            id: "seed-1",
            title: "Master React Architecture",
            description: "Deep dive into advanced React patterns and architecture",
            category: "Learning",
            status: "active",
            progress: 0,
            xpReward: 200,
            createdAt: Date.now(),
          },
          {
            id: "seed-2",
            title: "Build a SaaS Product",
            description: "From concept to first paying customer",
            category: "Business",
            status: "active",
            progress: 0,
            xpReward: 500,
            createdAt: Date.now(),
          }
        ];

        const seedMilestones: Milestone[] = [
          { id: "m1", missionId: "seed-1", title: "Learn Design Patterns", completed: false, order: 0 },
          { id: "m2", missionId: "seed-1", title: "Build complex project", completed: false, order: 1 },
          { id: "m3", missionId: "seed-1", title: "Write technical blog post", completed: false, order: 2 },
          { id: "m4", missionId: "seed-2", title: "Market Research", completed: false, order: 0 },
          { id: "m5", missionId: "seed-2", title: "MVP Development", completed: false, order: 1 },
          { id: "m6", missionId: "seed-2", title: "Beta Testing", completed: false, order: 2 },
          { id: "m7", missionId: "seed-2", title: "Launch", completed: false, order: 3 }
        ];

        await Promise.all([
          idb.putAll("missions", seedMissions),
          idb.putAll("milestones", seedMilestones),
        ]);

        return { missions: seedMissions, milestones: seedMilestones };
      }
      return { missions: allMissions, milestones: allMilestones };
    }
  });

  const createMissionMutation = useMutation({
    mutationFn: async (data: Omit<Mission, "id" | "createdAt" | "progress"> & { milestones: string[] }) => {
      const missionId = crypto.randomUUID();
      const newMission: Mission = {
        ...data,
        id: missionId,
        createdAt: Date.now(),
        progress: 0,
      };

      const newMilestones: Milestone[] = data.milestones.map((title, index) => ({
        id: crypto.randomUUID(),
        missionId,
        title,
        completed: false,
        order: index,
      }));

      await Promise.all([
        idb.put("missions", newMission),
        ...newMilestones.map(m => idb.put("milestones", m))
      ]);

      await addXPEvent("mission_created", 50, `Started mission: ${newMission.title}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["missionsData"] });
    }
  });

  const updateMissionMutation = useMutation({
    mutationFn: async ({ id, changes }: { id: string, changes: Partial<Mission> }) => {
      const mission = await idb.get<Mission>("missions", id);
      if (!mission) return;

      const updatedMission = { ...mission, ...changes };
      await idb.put("missions", updatedMission);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["missionsData"] });
    }
  });

  const calculateProgress = (missionId: string, allMilestones: Milestone[]) => {
    const relevantMilestones = allMilestones.filter(m => m.missionId === missionId);
    if (relevantMilestones.length === 0) return 0;
    const completed = relevantMilestones.filter(m => m.completed).length;
    return Math.round((completed / relevantMilestones.length) * 100);
  };

  const toggleMilestoneMutation = useMutation({
    mutationFn: async (id: string) => {
      const milestone = await idb.get<Milestone>("milestones", id);
      if (!milestone) return;

      const updatedMilestone: Milestone = {
        ...milestone,
        completed: !milestone.completed,
        completedAt: !milestone.completed ? Date.now() : undefined,
      };

      await idb.put("milestones", updatedMilestone);
      
      const allUpdatedMilestones = await idb.getAll<Milestone>("milestones");
      const missionId = milestone.missionId;
      const mission = await idb.get<Mission>("missions", missionId);
      
      if (mission) {
        const newProgress = calculateProgress(missionId, allUpdatedMilestones);
        await idb.put("missions", { ...mission, progress: newProgress });
        
        if (updatedMilestone.completed) {
          await addXPEvent("milestone_completed", 20, `Completed milestone: ${updatedMilestone.title}`);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["missionsData"] });
    }
  });

  const updateMilestoneMutation = useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: Partial<Milestone> }) => {
      const milestone = await idb.get<Milestone>("milestones", id);
      if (!milestone) return;
      await idb.put("milestones", { ...milestone, ...changes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["missionsData"] });
    },
  });

  const completeMissionMutation = useMutation({
    mutationFn: async (id: string) => {
      const mission = await idb.get<Mission>("missions", id);
      if (!mission) return;

      const today = new Date().toISOString().split("T")[0];

      if (mission.repeatsDaily) {
        // Daily-repeat missions: mark today as the last-completed day,
        // grant XP, and set progress to 100 for today. The daily reset
        // check (below) will reset progress to 0 on the next day so the
        // user can complete it again.
        const updatedMission: Mission = {
          ...mission,
          status: "active", // stays active — it repeats
          progress: 100,
          lastDailyReset: today,
        };
        await idb.put("missions", updatedMission);
        await addXPEvent("mission_completed", mission.xpReward, `Daily mission: ${mission.title}`);
      } else {
        // Normal mission: mark completed permanently.
        const updatedMission: Mission = {
          ...mission,
          status: "completed",
          progress: 100
        };
        await idb.put("missions", updatedMission);
        await addXPEvent("mission_completed", mission.xpReward, `Completed mission: ${mission.title}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["missionsData"] });
    }
  });

  /**
   * Daily reset: for any mission with repeatsDaily=true whose lastDailyReset
   * is before today, reset progress to 0 so the user can complete it again.
   * This runs on every query (cheap — IDB getAll + filtered write) and is
   * idempotent (only writes when a reset is actually needed).
   */
  const resetDailyMissions = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const allMissions = await idb.getAll<Mission>("missions");
      const toReset = allMissions.filter(
        (m) => m.repeatsDaily && m.lastDailyReset && m.lastDailyReset < today && m.progress > 0,
      );
      for (const m of toReset) {
        await idb.put("missions", { ...m, progress: 0 });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["missionsData"] });
    },
  });

  return {
    missions,
    milestones,
    isLoading,
    createMission: createMissionMutation.mutateAsync,
    updateMission: (id: string, changes: Partial<Mission>) => updateMissionMutation.mutateAsync({ id, changes }),
    completeMission: completeMissionMutation.mutateAsync,
    toggleMilestone: toggleMilestoneMutation.mutateAsync,
    updateMilestone: (id: string, changes: Partial<Milestone>) => updateMilestoneMutation.mutateAsync({ id, changes }),
    resetDailyMissions: resetDailyMissions.mutateAsync,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["missionsData"] })
  };
}
