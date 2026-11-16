/**
 * hooks/use-habits.ts — Habits feature client hook.
 *
 * Manages Habit records in IndexedDB (local cache) + syncs to Supabase
 * when a habit is published (so other users can recall it in real time
 * while building their own brains/pathways).
 *
 * Lifecycle (mirrors skills):
 *   1. Author creates a habit locally (IDB) with status='private'
 *   2. Author calls submitForReview(habitId) → status='in_review'
 *   3. Moderator calls approveAndPublish(habitId) → status='published'
 *      AND upserts to Supabase via PUT /api/v1/habits so other users
 *      can find it via /api/v1/habits/search?q=...
 *   4. Other users, when editing their brain, can search public habits
 *      via useHabits().searchPublic(query) and insert a habit reference
 *      into their node via NodeEditor's handleInsertHabit.
 *
 * Backed by IndexedDB 'habits' store (local cache) + Supabase
 * 'public.habits' table (published habits only).
 */
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { idb } from "@/lib/db";
import { env } from "@/lib/env";
import { getAuthToken } from "@/lib/auth-token";
import { useToast } from "@/hooks/use-toast";
import type { Habit } from "@/lib/types";

const STORE = "habits";

/**
 * Shape matching the Supabase public.habits table row.
 * Snake_case → camelCase conversion happens here.
 */
interface SupabaseHabitRow {
  id: string;
  new_routine: string;
  anchor_habit: string;
  timing: "before" | "after";
  reward: string;
  topic: string;
  milestone_id: string | null;
  mission_id: string | null;
  completion_log: string[];
  target_streak: number;
  author_name: string;
  status: "private" | "in_review" | "published";
  reviewer_id: string | null;
  published_at: string | null;
}

function toSupabaseRow(habit: Habit): SupabaseHabitRow {
  return {
    id: habit.id,
    new_routine: habit.newRoutine,
    anchor_habit: habit.anchorHabit,
    timing: habit.timing,
    reward: habit.reward,
    topic: habit.topic,
    milestone_id: habit.milestoneId ?? null,
    mission_id: habit.missionId ?? null,
    completion_log: habit.completionLog,
    target_streak: habit.targetStreak,
    author_name: habit.authorName ?? "Anonymous",
    status: habit.status ?? "private",
    reviewer_id: habit.reviewerId ?? null,
    published_at: habit.publishedAt ? new Date(habit.publishedAt).toISOString() : null,
  };
}

export interface PublicHabitSearchResult {
  id: string;
  new_routine: string;
  anchor_habit: string;
  timing: "before" | "after";
  reward: string;
  topic: string;
  target_streak: number;
  author_name: string;
}

export function useHabits() {
  const queryClient = useQueryClient();
  const queryKey = ["habits"];
  const { toast } = useToast();
  const [habitPickerOpen, setHabitPickerOpen] = useState(false);
  const [habitTemplate, setHabitTemplate] = useState<{
    newRoutine: string;
    anchorHabit: string;
    timing: "before" | "after";
    reward: string;
  }>({ newRoutine: "", anchorHabit: "", timing: "after", reward: "" });

  const { data: habits = [], isLoading } = useQuery<Habit[]>({
    queryKey,
    staleTime: 30_000,
    queryFn: async () => {
      try {
        return await idb.getAll<Habit>(STORE);
      } catch {
        return [];
      }
    },
  });

  /**
   * habitsByTopic: returns habits matching a given topic.
   * Used by NodeEditor to filter the habit picker to relevant habits
   * for the current brain's topic.
   */
  const habitsByTopic = useCallback(
    (topic: string): Habit[] => {
      if (!topic) return habits;
      return habits.filter((h) => h.topic === topic);
    },
    [habits],
  );

  /**
   * Persist a new habit to IDB. Returns the saved habit (with id + createdAt).
   * New habits start with status='private' (local only, not in Supabase).
   */
  const createHabit = useMutation({
    mutationFn: async (input: {
      newRoutine: string;
      anchorHabit: string;
      timing: "before" | "after";
      reward: string;
      topic: string;
      milestoneId?: string;
      missionId?: string;
      targetStreak?: number;
    }): Promise<Habit> => {
      if (!input.newRoutine.trim() || !input.anchorHabit.trim() || !input.reward.trim()) {
        throw new Error("Fill in all blanks: new routine, anchor habit, and reward.");
      }
      const habit: Habit = {
        id: crypto.randomUUID(),
        newRoutine: input.newRoutine.trim(),
        anchorHabit: input.anchorHabit.trim(),
        timing: input.timing,
        reward: input.reward.trim(),
        topic: input.topic,
        milestoneId: input.milestoneId,
        missionId: input.missionId,
        completionLog: [],
        targetStreak: input.targetStreak ?? 7,
        status: "private",
        createdAt: Date.now(),
      };
      await idb.put(STORE, habit);
      return habit;
    },
    onSuccess: (habit) => {
      void queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Habit created",
        description: `"${habit.newRoutine} ${habit.timing} ${habit.anchorHabit}" — target streak ${habit.targetStreak} days. Status: private.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not create habit",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  /**
   * Submit a private habit for moderator review.
   * Changes status from 'private' → 'in_review'.
   */
  const submitForReview = useMutation({
    mutationFn: async (habitId: string): Promise<Habit> => {
      const existing = await idb.get<Habit>(STORE, habitId);
      if (!existing) throw new Error("Habit not found");
      if (existing.status && existing.status !== "private") {
        throw new Error(`Habit is already ${existing.status} — only private habits can be submitted for review.`);
      }
      const updated: Habit = { ...existing, status: "in_review" };
      await idb.put(STORE, updated);
      return updated;
    },
    onSuccess: (habit) => {
      void queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Submitted for review",
        description: `"${habit.newRoutine}" is now visible to moderators.`,
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
   * Approve and publish a habit. Changes status from 'in_review' →
   * 'published', sets publishedAt + reviewerId, AND upserts the habit
   * to Supabase so other users can find it via /api/v1/habits/search.
   *
   * Only callable by moderators (the UI must gate this).
   */
  const approveAndPublish = useMutation({
    mutationFn: async (input: {
      habitId: string;
      reviewerId: string;
    }): Promise<Habit> => {
      const existing = await idb.get<Habit>(STORE, input.habitId);
      if (!existing) throw new Error("Habit not found");
      if (existing.status && existing.status !== "in_review") {
        throw new Error(`Habit is ${existing.status} — only in_review habits can be approved.`);
      }
      const updated: Habit = {
        ...existing,
        status: "published",
        reviewerId: input.reviewerId,
        publishedAt: Date.now(),
      };
      await idb.put(STORE, updated);

      // Sync to Supabase so other users can find this habit in real time.
      // NOTE: when VITE_API_BASE_URL is empty the URL is same-origin
      // relative ("/api/v1/habits") — same as api-client.ts — so this
      // ALWAYS runs in production behind the reverse proxy.
      try {
        const token = await getAuthToken().catch(() => null);
        const response = await fetch(`${env.apiBaseUrl}/api/v1/habits`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(toSupabaseRow(updated)),
        });
        if (!response.ok) {
          console.warn(`Habit sync to Supabase failed: ${response.status}`);
        }
      } catch (err) {
        console.warn("Habit sync to Supabase failed (network):", err);
      }

      return updated;
    },
    onSuccess: (habit) => {
      void queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Habit published",
        description: `"${habit.newRoutine}" is now public and searchable by other users building brains.`,
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
   * Search public habits from Supabase via the keyword search endpoint.
   * Used by NodeEditor when a user wants to insert a habit reference
   * into their own brain — they can find any published habit by any author.
   */
  const searchPublic = useMutation({
    mutationFn: async (input: {
      query: string;
      topic?: string;
      limit?: number;
    }): Promise<PublicHabitSearchResult[]> => {
      // Server-first search (same-origin when VITE_API_BASE_URL is empty,
      // exactly like api-client.ts). Falls back to local IDB results when
      // the server is unreachable so the UI still works offline.
      const params = new URLSearchParams({ q: input.query });
      if (input.topic) params.set("topic", input.topic);
      if (input.limit) params.set("limit", String(input.limit));

      try {
        const response = await fetch(`${env.apiBaseUrl}/api/v1/habits/search?${params}`);
        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`);
        }
        const data = await response.json();
        return Array.isArray(data.results) ? data.results : [];
      } catch (err) {
        console.warn("Public habit search fell back to local results:", err);
        const local = await idb.getAll<Habit>(STORE);
        const q = input.query.toLowerCase();
        return local
          .filter((h) => h.status === "published")
          .filter((h) => !q || h.newRoutine.toLowerCase().includes(q) || h.anchorHabit.toLowerCase().includes(q) || h.reward.toLowerCase().includes(q))
          .filter((h) => !input.topic || h.topic === input.topic)
          .slice(0, input.limit ?? 20)
          .map((h) => ({
            id: h.id,
            new_routine: h.newRoutine,
            anchor_habit: h.anchorHabit,
            timing: h.timing,
            reward: h.reward,
            topic: h.topic,
            target_streak: h.targetStreak,
            author_name: h.authorName ?? "Anonymous",
          }));
      }
    },
  });

  /**
   * Mark a habit as completed for today (idempotent — only adds the
   * date once). The completionLog is an array of YYYY-MM-DD strings.
   * Note: completionLog is local-only (personal streak tracking) —
   * never synced to Supabase.
   */
  const markCompletedToday = useMutation({
    mutationFn: async (habitId: string): Promise<Habit | null> => {
      const existing = await idb.get<Habit>(STORE, habitId);
      if (!existing) return null;
      const today = new Date().toISOString().slice(0, 10);
      if (existing.completionLog.includes(today)) {
        return existing;
      }
      const updated: Habit = {
        ...existing,
        completionLog: [...existing.completionLog, today],
      };
      await idb.put(STORE, updated);
      return updated;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  /** Delete a habit (only the author should call this). */
  const deleteHabit = useMutation({
    mutationFn: async (habitId: string): Promise<void> => {
      await idb.delete(STORE, habitId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  /**
   * handleInsertHabit: state-only helper that closes the picker.
   * NodeEditor passes its own insert callback that writes the
   * HabitNote to the active node; this hook just manages picker state.
   */
  const handleInsertHabit = useCallback(() => {
    setHabitPickerOpen(false);
    setHabitTemplate({ newRoutine: "", anchorHabit: "", timing: "after", reward: "" });
  }, []);

  return {
    habits,
    isLoading,
    habitsByTopic,
    habitPickerOpen,
    setHabitPickerOpen,
    habitTemplate,
    setHabitTemplate,
    handleInsertHabit,
    createHabit: createHabit.mutateAsync,
    submitForReview: submitForReview.mutateAsync,
    approveAndPublish: approveAndPublish.mutateAsync,
    searchPublic: searchPublic.mutateAsync,
    markCompletedToday: markCompletedToday.mutateAsync,
    deleteHabit: deleteHabit.mutateAsync,
  };
}
