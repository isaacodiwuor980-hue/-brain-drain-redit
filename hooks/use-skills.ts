/**
 * hooks/use-skills.ts — Skills feature client hook.
 *
 * Manages SkillEntry records in IndexedDB (local cache) + syncs to
 * Supabase when a skill is published (so other users can recall it
 * in real time while building their own brains/pathways).
 *
 * Lifecycle:
 *   1. Author creates a brain with detailed step-by-step nodes
 *   2. Author calls createSkillFromBrain(brainId, metadata) — extracts
 *      the brain's nodes into SkillStep[] and creates a SkillEntry
 *      with status='private' (local only, not yet in Supabase)
 *   3. Author calls submitForReview(skillId) — changes status to
 *      'in_review' so moderators can see it (still local)
 *   4. Moderator calls approveAndPublish(skillId) — changes status
 *      to 'published' + UPSERTS to Supabase so other users can find
 *      it via /api/v1/search/skills
 *   5. Other users, when editing their own brain, search public skills
 *      via useSkills().searchPublic(query) which calls the server-side
 *      search endpoint. They can then insert a skill into their node
 *      via NodeEditor's handleInsertSkill.
 *
 * Backed by IndexedDB 'skills' store (local cache) + Supabase
 * 'public.skills' table (published skills only).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { idb } from "@/lib/db";
import { env } from "@/lib/env";
import { useToast } from "@/hooks/use-toast";
import type { SkillEntry, SkillStep, Brain, Node } from "@/lib/types";

const STORE = "skills";

/**
 * Deterministic skill ID from the source brain. The same brain + version
 * always maps to the SAME skill row, so re-publishing an updated extract
 * from the same brain UPSERTS the existing row (idempotent) instead of
 * creating duplicate rows in Supabase.
 */
export function buildSkillId(brainId: string, version = "v1"): string {
  return `${brainId}-skill-${version}`;
}

/**
 * Extract SkillStep[] from a brain's nodes.
 *
 * Each outcome node becomes one SkillStep. Question nodes are skipped
 * (they're decision points, not actions). The order field is the
 * node's position in the brain's traversal order — we use the order
 * they come back from IDB since brains don't store explicit ordering.
 */
function extractStepsFromBrain(brain: Brain | undefined, nodes: Node[]): SkillStep[] {
  if (!brain || !nodes.length) return [];
  return nodes
    .filter((n) => n.node_type === "outcome" && (n.result_text || n.next_steps))
    .map((n, idx) => ({
      order: idx + 1,
      action: n.result_text || n.next_steps || "",
      tool: undefined,
      why: n.question_text || brain.title,
      errorIfSkipped: undefined,
      yesOutcome: undefined,
      noOutcome: undefined,
      keywords: n.question_text
        ? n.question_text.split(/\s+/).filter((w) => w.length > 4).slice(0, 5)
        : [],
    }));
}

/** No trusted moderator, identity bridge or publication receipt is verified. */
export function skillPublishingAvailable(): boolean { return false; }

export interface PublicSkillSearchResult {
  id: string;
  title: string;
  domain: string;
  make: string | null;
  model: string | null;
  year: number | null;
  part: string | null;
  version: string;
  author_name: string;
  author_years_experience: number | null;
  status: string;
  source_brain_id: string | null;
}

export function useSkills() {
  const queryClient = useQueryClient();
  const queryKey = ["skills"];
  const { toast } = useToast();

  /** Local skills (own + cached). */
  const { data: skills = [], isLoading } = useQuery<SkillEntry[]>({
    queryKey,
    staleTime: 30_000,
    queryFn: async () => {
      try {
        return await idb.getAll<SkillEntry>(STORE);
      } catch {
        return [];
      }
    },
  });

  /**
   * Create a SkillEntry from an existing brain. Extracts the brain's
   * outcome nodes into SkillStep[]. The new skill starts with
   * status='private' so only the author can see it until they
   * submit for review.
   */
  const createSkillFromBrain = useMutation({
    mutationFn: async (input: {
      brainId: string;
      skillMetadata: Partial<Pick<SkillEntry, "domain" | "make" | "model" | "year" | "part" | "title" | "authorName" | "authorYearsExperience">>;
    }): Promise<SkillEntry> => {
      const brain = await idb.get<Brain>("brains", input.brainId);
      const nodes = await idb.getAllByIndex<Node>("nodes", "brain_id", input.brainId);
      const steps = extractStepsFromBrain(brain, nodes);

      if (steps.length === 0) {
        throw new Error("This brain has no outcome nodes — add some decision outcomes before extracting a skill.");
      }

      const now = Date.now();
      const skill: SkillEntry = {
        // Deterministic: same brain + version → same row. Re-publishing
        // updates the existing skill instead of duplicating it.
        id: buildSkillId(input.brainId),
        domain: input.skillMetadata.domain || brain?.category || "general",
        make: input.skillMetadata.make,
        model: input.skillMetadata.model,
        year: input.skillMetadata.year,
        part: input.skillMetadata.part,
        version: "v1",
        title: input.skillMetadata.title || brain?.title || "Untitled skill",
        authorName: input.skillMetadata.authorName || "Me",
        authorYearsExperience: input.skillMetadata.authorYearsExperience,
        steps,
        sourceBrainId: input.brainId,
        status: "private",
        createdAt: now,
      };
      await idb.put(STORE, skill);
      return skill;
    },
    onSuccess: (skill) => {
      void queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Skill created",
        description: `"${skill.title}" extracted from brain with ${skill.steps.length} steps. Status: private.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not create skill",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  /**
   * Submit a private skill for moderator review. Changes status
   * from 'private' → 'in_review'.
   */
  const submitForReview = useMutation({
    mutationFn: async (skillId: string): Promise<SkillEntry> => {
      const existing = await idb.get<SkillEntry>(STORE, skillId);
      if (!existing) throw new Error("Skill not found");
      if (existing.status !== "private") {
        throw new Error(`Skill is already ${existing.status} — only private skills can be submitted for review.`);
      }
      const updated: SkillEntry = { ...existing, status: "in_review" };
      await idb.put(STORE, updated);
      return updated;
    },
    onSuccess: (skill) => {
      void queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Submitted for review",
        description: `"${skill.title}" is now visible to moderators. You'll be notified when it's approved.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not submit",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  /** Fail closed until server authorization and publication receipts exist. */
  const approveAndPublish = useMutation({
    mutationFn: async (_input: { skillId: string; reviewerId: string }): Promise<SkillEntry> => {
      throw new Error("Skill publishing is temporarily unavailable");
    },
    onError: (err: Error) => {
      toast({ title: "Could not publish", description: err.message, variant: "destructive" });
    },
  });

  /**
   * Search public skills from Supabase via the three-layer search
   * endpoint. Used by NodeEditor when a user wants to insert a skill
   * reference into their own brain — they can find any published skill
   * by any author.
   */
  const searchPublic = useMutation({
    mutationFn: async (input: {
      query: string;
      domain?: string;
      make?: string;
      model?: string;
      year?: number;
      part?: string;
      limit?: number;
    }): Promise<PublicSkillSearchResult[]> => {
      // A cached "published" status does not prove current visibility.
      // On outage, report unavailable rather than expose unverified records.
      const params = new URLSearchParams({ q: input.query });
      if (input.domain) params.set("domain", input.domain);
      if (input.make) params.set("make", input.make);
      if (input.model) params.set("model", input.model);
      if (input.year) params.set("year", String(input.year));
      if (input.part) params.set("part", input.part);
      if (input.limit) params.set("limit", String(input.limit));

      try {
        const response = await fetch(`${env.apiBaseUrl}/api/v1/search/skills?${params}`);
        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`);
        }
        const data = await response.json();
        return Array.isArray(data.results) ? data.results : [];
      } catch {
        throw new Error("Skill search is temporarily unavailable");
      }
    },
  });

  /** Delete a skill (only the author should call this). */
  const deleteSkill = useMutation({
    mutationFn: async (skillId: string): Promise<void> => {
      await idb.delete(STORE, skillId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    skills,
    isLoading,
    createSkillFromBrain: createSkillFromBrain.mutateAsync,
    submitForReview: submitForReview.mutateAsync,
    approveAndPublish: approveAndPublish.mutateAsync,
    searchPublic: searchPublic.mutateAsync,
    deleteSkill: deleteSkill.mutateAsync,
  };
}
