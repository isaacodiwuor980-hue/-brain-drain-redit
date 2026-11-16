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
import { getAuthToken } from "@/lib/auth-token";
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

/**
 * Shape matching the Supabase public.skills table row.
 * Used for upserting on publish.
 */
interface SupabaseSkillRow {
  id: string;
  domain: string;
  make: string | null;
  model: string | null;
  year: number | null;
  part: string | null;
  version: string;
  title: string;
  author_name: string;
  author_years_experience: number | null;
  steps: SkillStep[];
  source_brain_id: string | null;
  status: "private" | "in_review" | "published";
  reviewer_id: string | null;
  published_at: string | null;
}

function toSupabaseRow(skill: SkillEntry): SupabaseSkillRow {
  return {
    id: skill.id,
    domain: skill.domain,
    make: skill.make ?? null,
    model: skill.model ?? null,
    year: skill.year ?? null,
    part: skill.part ?? null,
    version: skill.version,
    title: skill.title,
    author_name: skill.authorName,
    author_years_experience: skill.authorYearsExperience ?? null,
    steps: skill.steps,
    source_brain_id: skill.sourceBrainId ?? null,
    status: skill.status,
    reviewer_id: skill.reviewerId ?? null,
    published_at: skill.publishedAt ? new Date(skill.publishedAt).toISOString() : null,
  };
}

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
  const publicQueryKey = ["skills", "public"];
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

  /**
   * Approve and publish a skill. Changes status from 'in_review' →
   * 'published', sets publishedAt + reviewerId, AND upserts the skill
   * to Supabase so other users can find it via /api/v1/search/skills.
   *
   * Only callable by moderators (the UI must gate this — the hook
   * itself doesn't check moderator status).
   */
  const approveAndPublish = useMutation({
    mutationFn: async (input: {
      skillId: string;
      reviewerId: string;
    }): Promise<SkillEntry> => {
      const existing = await idb.get<SkillEntry>(STORE, input.skillId);
      if (!existing) throw new Error("Skill not found");
      if (existing.status !== "in_review") {
        throw new Error(`Skill is ${existing.status} — only in_review skills can be approved.`);
      }
      const updated: SkillEntry = {
        ...existing,
        status: "published",
        reviewerId: input.reviewerId,
        publishedAt: Date.now(),
      };
      await idb.put(STORE, updated);

      // Sync to Supabase so other users can find this skill in real time.
      // Best-effort: if the API call fails, the skill is still published
      // locally and will sync on next app boot via a background job.
      // NOTE: when VITE_API_BASE_URL is empty the URL is same-origin
      // relative ("/api/v1/skills") — same as api-client.ts — so this
      // ALWAYS runs in production behind the reverse proxy.
      try {
        const token = await getAuthToken().catch(() => null);
        const response = await fetch(`${env.apiBaseUrl}/api/v1/skills`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(toSupabaseRow(updated)),
        });
        if (!response.ok) {
          console.warn(`Skill sync to Supabase failed: ${response.status}`);
        }
      } catch (err) {
        console.warn("Skill sync to Supabase failed (network):", err);
      }

      return updated;
    },
    onSuccess: (skill) => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: publicQueryKey });
      toast({
        title: "Skill published",
        description: `"${skill.title}" is now public and searchable by other users building brains.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not publish",
        description: err.message,
        variant: "destructive",
      });
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
      // Server-first search (same-origin when VITE_API_BASE_URL is empty,
      // exactly like api-client.ts). Falls back to local IDB results when
      // the server is unreachable so the UI still works offline.
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
      } catch (err) {
        console.warn("Public skill search fell back to local results:", err);
        const local = await idb.getAll<SkillEntry>(STORE);
        const q = input.query.toLowerCase();
        return local
          .filter((s) => s.status === "published")
          .filter((s) => !q || s.title.toLowerCase().includes(q) || s.domain.toLowerCase().includes(q))
          .slice(0, input.limit ?? 20)
          .map((s) => ({
            id: s.id,
            title: s.title,
            domain: s.domain,
            make: s.make ?? null,
            model: s.model ?? null,
            year: s.year ?? null,
            part: s.part ?? null,
            version: s.version,
            author_name: s.authorName,
            author_years_experience: s.authorYearsExperience ?? null,
            status: s.status,
            source_brain_id: s.sourceBrainId ?? null,
          }));
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
