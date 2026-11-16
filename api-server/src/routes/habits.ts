/**
 * api-server/src/routes/habits.ts — Habits CRUD route.
 *
 * Mirrors the skills route pattern. Habits are behavior-loop templates
 * (newRoutine + anchorHabit + timing + reward) that can be referenced
 * from brain nodes via Node.habitNote.
 *
 * Lifecycle:
 *   1. Author creates a habit locally (IDB) with status='private'
 *   2. Author calls submitForReview(habitId) → status='in_review'
 *   3. Moderator calls approveAndPublish(habitId) → status='published'
 *      AND upserts to Supabase via PUT /api/v1/habits so other users
 *      can find it via /api/v1/habits/search?q=...
 *
 * Endpoints:
 *   GET    /api/v1/habits             — list published habits (with optional filters)
 *   GET    /api/v1/habits/:id         — fetch a single published habit
 *   GET    /api/v1/habits/search?q=   — keyword search across published habits
 *   PUT    /api/v1/habits             — upsert a habit (used when publishing)
 *   DELETE /api/v1/habits/:id         — delete a habit (only author)
 */
import { Router, type IRouter } from "express";
import { z } from "zod";
import { supabase, SupabaseError } from "../lib/supabase";
import { logger } from "../lib/logger";
import { optionalAuth, requireAuth } from "../middleware/auth";
import type { VerifiedAuth } from "../lib/firebase-auth";

const router: IRouter = Router();

const HabitRowSchema = z.object({
  id: z.string().min(1),
  new_routine: z.string().min(1),
  anchor_habit: z.string().min(1),
  timing: z.enum(["before", "after"]),
  reward: z.string().min(1),
  topic: z.string().min(1),
  milestone_id: z.string().nullable().optional(),
  mission_id: z.string().nullable().optional(),
  completion_log: z.array(z.string()).default([]),
  target_streak: z.number().int().min(1).max(365).default(7),
  author_name: z.string().default("Anonymous"),
  status: z.enum(["private", "in_review", "published"]),
  reviewer_id: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
});

/**
 * Shape of a row in the Supabase public.habits table. Mirrors the
 * SupabaseHabitRow interface in hooks/use-habits.ts and adds the
 * server-only columns (author_id, created_at, updated_at) that the
 * API handlers read but the client hook never touches. Used as the
 * generic for supabase.get so reads like `habit.status` and
 * `habit.author_id` are type-checked.
 */
interface HabitRow {
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
  author_id: string;
  status: "private" | "in_review" | "published";
  reviewer_id: string | null;
  published_at: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * GET /api/v1/habits — list published habits.
 * Query params: topic, limit (default 20).
 */
router.get("/v1/habits", optionalAuth, async (req, res) => {
  if (!supabase.isConfigured()) {
    res.json({ habits: [], source: "local-only" });
    return;
  }
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const filters: Record<string, string> = { status: "eq.published" };
    // Strict slug validation — prevents PostgREST filter-injection.
    if (typeof req.query.topic === "string" && /^[A-Za-z0-9_-]+$/.test(req.query.topic)) {
      filters.topic = `eq.${req.query.topic}`;
    }
    const rows = await supabase.get<HabitRow>("habits", {
      select: "id,new_routine,anchor_habit,timing,reward,topic,target_streak,author_name,status,created_at",
      filters,
      order: { column: "published_at", ascending: false },
      limit,
    });
    res.json({ habits: rows, source: "supabase" });
  } catch (err) {
    logger.warn({ err }, "Habit list failed — table may not exist");
    res.json({ habits: [], source: "supabase-unavailable", error: "Habits table not yet deployed" });
  }
});

/**
 * GET /api/v1/habits/search?q=... — keyword search across published habits.
 * Uses Postgres FTS on new_routine + anchor_habit + reward.
 */
router.get("/v1/habits/search", optionalAuth, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ error: "Missing query parameter 'q'" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.json({ query: q, results: [], source: "local-only" });
    return;
  }
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const rows = await supabase.get<HabitRow>("habits", {
      select: "id,new_routine,anchor_habit,timing,reward,topic,target_streak,author_name",
      filters: {
        status: "eq.published",
        "new_routine": `fts.${q}`,
      },
      order: { column: "published_at", ascending: false },
      limit,
    });
    res.json({ query: q, results: rows, resultCount: rows.length });
  } catch (err) {
    logger.warn({ err }, "Habit search failed — returning empty");
    res.json({
      query: q,
      results: [],
      resultCount: 0,
      note: "Habit search unavailable — the habits table may not exist in Supabase yet.",
    });
  }
});

/**
 * GET /api/v1/habits/:id — fetch a single habit.
 * Public if status='published'; otherwise requires auth + author match.
 */
router.get("/v1/habits/:id", optionalAuth, async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: "Invalid habit id" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }
  try {
    const rows = await supabase.get<HabitRow>("habits", {
      select: "*",
      filters: { id: `eq.${id}` },
      limit: 1,
    });
    if (rows.length === 0) {
      res.status(404).json({ error: "Habit not found" });
      return;
    }
    const habit = rows[0];
    if (habit.status === "published") {
      res.json(habit);
      return;
    }
    const auth: VerifiedAuth | undefined = req.auth;
    if (!auth || auth.uid !== habit.author_id) {
      res.status(403).json({ error: "Not authorized to view this habit" });
      return;
    }
    res.json(habit);
  } catch (err) {
    logger.warn({ err }, "Habit fetch failed — table may not exist");
    res.status(404).json({ error: "Habit not found (table may not be deployed)" });
  }
});

/**
 * PUT /api/v1/habits — upsert a habit (used when publishing).
 * Requires auth. The habit's author_id is set from the auth token.
 */
router.put("/v1/habits", requireAuth, async (req, res) => {
  const auth: VerifiedAuth | undefined = req.auth;
  if (!auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Supabase not configured — cannot publish habit" });
    return;
  }
  const parsed = HabitRowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid habit payload", details: parsed.error.flatten() });
    return;
  }
  const row = {
    ...parsed.data,
    author_id: auth.uid,
    updated_at: new Date().toISOString(),
  };
  try {
    await supabase.insert("habits", row, "resolution=merge-duplicates");
    logger.info({ habitId: row.id, authorId: auth.uid }, "Habit upserted to Supabase");
    res.json({ ok: true, habit: row });
  } catch (err) {
    if (err instanceof SupabaseError) {
      logger.error({ err, status: err.status, body: err.body }, "Habit upsert failed (Supabase)");
      res.status(502).json({ error: "Supabase rejected the habit", details: err.body });
    } else {
      logger.error({ err }, "Habit upsert failed");
      res.status(500).json({ error: "Failed to publish habit" });
    }
  }
});

/**
 * DELETE /api/v1/habits/:id — delete a habit.
 * Requires auth + author match.
 */
router.delete("/v1/habits/:id", requireAuth, async (req, res) => {
  const auth: VerifiedAuth | undefined = req.auth;
  if (!auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }
  const id = String(req.params.id ?? "");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: "Invalid habit id" });
    return;
  }
  try {
    const rows = await supabase.get<HabitRow>("habits", {
      select: "id,author_id",
      filters: { id: `eq.${id}` },
      limit: 1,
    });
    if (rows.length === 0) {
      res.status(404).json({ error: "Habit not found" });
      return;
    }
    if (rows[0].author_id !== auth.uid) {
      res.status(403).json({ error: "Not authorized to delete this habit" });
      return;
    }
    await supabase.delete("habits", { id: `eq.${id}` });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Habit delete failed");
    res.status(500).json({ error: "Failed to delete habit" });
  }
});

export default router;
