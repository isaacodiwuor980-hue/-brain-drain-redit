import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pathway, PathwayMilestone, Post } from "../lib/types";
import { idb } from "../lib/db";
import { trackEvent } from "../lib/analytics";

export function usePathways() {
  const queryClient = useQueryClient();

  const { data: pathways = [], isLoading } = useQuery({
    queryKey: ["pathways"],
    queryFn: async () => {
      return await idb.getAll<Pathway>("pathways");
    }
  });

  const createPathwayMutation = useMutation({
    mutationFn: async (data: Omit<Pathway, "id" | "createdAt" | "forkCount">) => {
      const newPathway: Pathway = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        forkCount: 0,
      };
      await idb.put("pathways", newPathway);
      return newPathway;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pathways"] });
    }
  });

  const forkPathwayMutation = useMutation({
    mutationFn: async ({ id, newTitle, newDesc }: { id: string, newTitle: string, newDesc: string }) => {
      const original = pathways.find(p => p.id === id);
      if (!original) return undefined;

      const forkedPathway: Pathway = {
        ...original,
        id: crypto.randomUUID(),
        title: newTitle,
        description: newDesc,
        forkedFromId: original.id,
        forkCount: 0,
        createdAt: Date.now(),
      };

      const updatedOriginal: Pathway = {
        ...original,
        forkCount: original.forkCount + 1,
      };

      await Promise.all([
        idb.put("pathways", forkedPathway),
        idb.put("pathways", updatedOriginal)
      ]);
      return forkedPathway;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pathways"] });
    }
  });

  // ── Pathway milestone mutations ────────────────────────────────
  // Each mutation reads the pathway, mutates its milestones array,
  // and writes it back. Milestones are stored inline on the Pathway
  // record so reading a pathway also reads its milestones atomically.

  /** Helper: read a pathway, apply a transform to its milestones, write it back. */
  const updatePathwayMilestones = async (
    pathwayId: string,
    transform: (milestones: PathwayMilestone[]) => PathwayMilestone[],
  ): Promise<Pathway | undefined> => {
    const pathway = await idb.get<Pathway>("pathways", pathwayId);
    if (!pathway) throw new Error("pathway not found");
    const updated: Pathway = {
      ...pathway,
      milestones: transform(pathway.milestones ?? []),
    };
    await idb.put("pathways", updated);
    return updated;
  };

  const addMilestoneMutation = useMutation({
    mutationFn: async ({ pathwayId, title }: { pathwayId: string; title: string }) => {
      const now = Date.now();
      return updatePathwayMilestones(pathwayId, (milestones) => {
        const nextOrder = milestones.length > 0 ? Math.max(...milestones.map(m => m.order)) + 1 : 0;
        const newMilestone: PathwayMilestone = {
          id: crypto.randomUUID(),
          title: title.trim(),
          order: nextOrder,
          completed: false,
          createdAt: now,
          updatedAt: now,
        };
        return [...milestones, newMilestone];
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pathways"] }),
  });

  const renameMilestoneMutation = useMutation({
    mutationFn: async ({ pathwayId, milestoneId, title }: { pathwayId: string; milestoneId: string; title: string }) => {
      return updatePathwayMilestones(pathwayId, (milestones) =>
        milestones.map(m => m.id === milestoneId ? { ...m, title: title.trim(), updatedAt: Date.now() } : m),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pathways"] }),
  });

  const attachMindToMilestoneMutation = useMutation({
    mutationFn: async ({ pathwayId, milestoneId, mindId }: { pathwayId: string; milestoneId: string; mindId: string | undefined }) => {
      return updatePathwayMilestones(pathwayId, (milestones) =>
        milestones.map(m => m.id === milestoneId ? { ...m, linkedMindId: mindId, updatedAt: Date.now() } : m),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pathways"] }),
  });

  const setCognitiveScenarioMutation = useMutation({
    mutationFn: async ({ pathwayId, milestoneId, scenario }: { pathwayId: string; milestoneId: string; scenario: string }) => {
      return updatePathwayMilestones(pathwayId, (milestones) =>
        milestones.map(m => m.id === milestoneId ? { ...m, cognitiveScenario: scenario.trim().slice(0, 500), updatedAt: Date.now() } : m),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pathways"] }),
  });

  const completeMilestoneMutation = useMutation({
    mutationFn: async ({ pathwayId, milestoneId, completionNotes }: { pathwayId: string; milestoneId: string; completionNotes?: string }) => {
      return updatePathwayMilestones(pathwayId, (milestones) =>
        milestones.map(m => m.id === milestoneId ? {
          ...m,
          completed: true,
          completedAt: Date.now(),
          completionNotes: completionNotes?.trim() || undefined,
          updatedAt: Date.now(),
        } : m),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pathways"] }),
  });

  const uncompleteMilestoneMutation = useMutation({
    mutationFn: async ({ pathwayId, milestoneId }: { pathwayId: string; milestoneId: string }) => {
      return updatePathwayMilestones(pathwayId, (milestones) =>
        milestones.map(m => m.id === milestoneId ? {
          ...m,
          completed: false,
          completedAt: undefined,
          completionNotes: undefined,
          updatedAt: Date.now(),
        } : m),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pathways"] }),
  });

  const removeMilestoneMutation = useMutation({
    mutationFn: async ({ pathwayId, milestoneId }: { pathwayId: string; milestoneId: string }) => {
      return updatePathwayMilestones(pathwayId, (milestones) =>
        milestones.filter(m => m.id !== milestoneId),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pathways"] }),
  });

  /**
   * Posts a milestone's daily cognitive scenario to the home feed as a
   * special "scenario" post type. The user explicitly asked for a way to
   * "post" their daily cognitive scenario — this is it.
   *
   * The post body is the scenario text, prefixed with a header line so
   * the feed can render it distinctly. The post links back to the
   * pathway + milestone via mindId (reusing the existing field) so the
   * feed can show a "from pathway X · milestone Y" badge.
   *
   * Returns the created Post.
   */
  const postScenarioToFeedMutation = useMutation({
    mutationFn: async (input: {
      pathway: Pathway;
      milestone: PathwayMilestone;
      userId: string;
    }): Promise<Post> => {
      const { pathway, milestone, userId } = input;
      if (!milestone.cognitiveScenario || !milestone.cognitiveScenario.trim()) {
        throw new Error("This milestone has no cognitive scenario to post.");
      }
      const post: Post = {
        id: crypto.randomUUID(),
        userId,
        topicId: pathway.category || "general",
        title: `Daily cognitive scenario: ${milestone.title}`,
        content: milestone.cognitiveScenario.trim(),
        postType: "post",
        mindId: milestone.linkedMindId,
        reactions: { upvote: 0, downvote: 0 },
        commentCount: 0,
        createdAt: Date.now(),
      };
      await idb.put("posts", post);
      await trackEvent("pathway_scenario_posted", {
        pathwayId: pathway.id,
        milestoneId: milestone.id,
        postId: post.id,
      });
      // Invalidate the home feed so the new post appears.
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      return post;
    },
  });

  return {
    pathways,
    isLoading,
    createPathway: createPathwayMutation.mutateAsync,
    forkPathway: (id: string, newTitle: string, newDesc: string) => forkPathwayMutation.mutateAsync({ id, newTitle, newDesc }),
    // Milestone operations — all return the updated Pathway.
    addMilestone: (pathwayId: string, title: string) => addMilestoneMutation.mutateAsync({ pathwayId, title }),
    renameMilestone: (pathwayId: string, milestoneId: string, title: string) => renameMilestoneMutation.mutateAsync({ pathwayId, milestoneId, title }),
    attachMindToMilestone: (pathwayId: string, milestoneId: string, mindId: string | undefined) => attachMindToMilestoneMutation.mutateAsync({ pathwayId, milestoneId, mindId }),
    setCognitiveScenario: (pathwayId: string, milestoneId: string, scenario: string) => setCognitiveScenarioMutation.mutateAsync({ pathwayId, milestoneId, scenario }),
    completeMilestone: (pathwayId: string, milestoneId: string, completionNotes?: string) => completeMilestoneMutation.mutateAsync({ pathwayId, milestoneId, completionNotes }),
    uncompleteMilestone: (pathwayId: string, milestoneId: string) => uncompleteMilestoneMutation.mutateAsync({ pathwayId, milestoneId }),
    removeMilestone: (pathwayId: string, milestoneId: string) => removeMilestoneMutation.mutateAsync({ pathwayId, milestoneId }),
    // Post a milestone's cognitive scenario to the home feed.
    postScenarioToFeed: (pathway: Pathway, milestone: PathwayMilestone, userId: string) =>
      postScenarioToFeedMutation.mutateAsync({ pathway, milestone, userId }),
    isPostingScenario: postScenarioToFeedMutation.isPending,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["pathways"] })
  };
}
