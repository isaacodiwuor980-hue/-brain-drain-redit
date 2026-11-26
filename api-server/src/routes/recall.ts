/**
 * api-server/src/routes/recall.ts — Spaced-repetition recall events.
 *
 * Uses a variant of the SM-2 algorithm (SuperMemo 2). Each recall event
 * records the user's attempt and computes the next scheduled recall time.
 *
 * SM-2 algorithm summary:
 *   - quality q in {0,1,2,3,4,5} (0=blackout, 5=perfect)
 *   - if q < 3: reset repetitions=0, interval=1 day
 *   - else:
 *       repetition += 1
 *       if repetition == 1: interval = 1 day
 *       elif repetition == 2: interval = 6 days
 *       else: interval = round(previousInterval * easeFactor)
 *   - easeFactor update:
 *       ef_new = ef_old + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 *       ef_new = max(1.3, ef_new)
 *
 * Endpoints:
 *   POST /api/recall           -- record a recall event (auth)
 *   GET  /api/recall/due       -- get items due for recall now (auth)
 *   GET  /api/recall/history   -- get recent recall history (auth)
 */
import { Router, type IRouter } from "express";
import { z } from "zod";
import { supabase, SupabaseError } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { requireMappedIdentity } from "../middleware/identity-map";

const router: IRouter = Router();
router.use("/recall", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); }, requireAuth, requireMappedIdentity);

function parseLimit(value: unknown, fallback: number, maximum: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

const RecordSchema = z.object({
  brainId: z.string().uuid().optional(),
  topicId: z.string().max(80).optional(),
  quality: z.number().int().min(0).max(5),
  // Optional: previous SM-2 state. If omitted, defaults are used (rep=0, int=0, ef=2.5).
  sm2StateBefore: z.object({
    repetition: z.number().int().min(0).optional(),
    intervalDays: z.number().min(0).optional(),
    easeFactor: z.number().min(1.3).optional(),
  }).optional(),
});

interface Sm2State {
  repetition: number;
  intervalDays: number;
  easeFactor: number;
}

const DEFAULT_SM2_STATE: Sm2State = {
  repetition: 0,
  intervalDays: 0,
  easeFactor: 2.5,
};

/**
 * Compute the next SM-2 state given the previous state and the recall quality.
 */
function computeNextState(prev: Sm2State, quality: number): Sm2State {
  if (quality < 3) {
    // Failed recall: reset.
    return {
      repetition: 0,
      intervalDays: 1,
      easeFactor: Math.max(1.3, prev.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))),
    };
  }

  const repetition = prev.repetition + 1;
  let intervalDays: number;
  if (repetition === 1) {
    intervalDays = 1;
  } else if (repetition === 2) {
    intervalDays = 6;
  } else {
    intervalDays = Math.round(prev.intervalDays * prev.easeFactor);
    if (intervalDays < 1) intervalDays = 1;
  }

  const easeFactor = Math.max(
    1.3,
    prev.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  return { repetition, intervalDays, easeFactor: Math.round(easeFactor * 100) / 100 };
}

/**
 * POST /api/recall
 * Record a recall event. The next state is calculated server-side, but the
 * previous state is caller-supplied and is not an authoritative history.
 */
router.post("/recall", async (req, res) => {
  const parsed = RecordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid recall event", details: parsed.error.flatten() });
    return;
  }

  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  const prev: Sm2State = {
    repetition: parsed.data.sm2StateBefore?.repetition ?? DEFAULT_SM2_STATE.repetition,
    intervalDays: parsed.data.sm2StateBefore?.intervalDays ?? DEFAULT_SM2_STATE.intervalDays,
    easeFactor: parsed.data.sm2StateBefore?.easeFactor ?? DEFAULT_SM2_STATE.easeFactor,
  };
  const next = computeNextState(prev, parsed.data.quality);
  const nextTimestamp = Date.now() + next.intervalDays * 86_400_000;
  if (!Number.isSafeInteger(next.repetition) || !Number.isSafeInteger(next.intervalDays) ||
      !Number.isFinite(next.easeFactor) || !Number.isFinite(nextTimestamp) || nextTimestamp > 8_640_000_000_000_000) {
    res.status(400).json({ error: "Invalid recall schedule" }); return;
  }
  const nextRecallAt = new Date(nextTimestamp).toISOString();

  try {
    await supabase.insert("recall_events", {
      user_id: req.mappedUserId!,
      brain_id: parsed.data.brainId || null,
      topic_id: parsed.data.topicId || null,
      quality: parsed.data.quality,
      sm2_state_before: prev,
      sm2_state_after: next,
      next_recall_at: nextRecallAt,
    });

    res.json({
      ok: true,
      sm2State: next,
      nextRecallAt,
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Recall record failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * GET /api/recall/due
 * Get items due for recall (next_recall_at <= now), ordered by soonest first.
 */
router.get("/recall/due", async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  const limit = parseLimit(req.query.limit, 20, 100);
  if (limit === null) { res.status(400).json({ error: "Invalid limit" }); return; }

  try {
    // PostgREST filter: next_recall_at=lte.<iso_now>
    const nowIso = new Date().toISOString();
    const rows = await supabase.get<{
      id: string;
      user_id: string;
      brain_id: string | null;
      topic_id: string | null;
      next_recall_at: string;
    }>("recall_events", {
      select: "id,user_id,brain_id,topic_id,next_recall_at",
      filters: {
        user_id: `eq.${req.mappedUserId!}`,
        next_recall_at: `lte.${nowIso}`,
      },
      order: { column: "next_recall_at", ascending: true },
      limit,
    });

    if (rows.some(row => typeof row.user_id !== "string" || row.user_id.toLowerCase() !== req.mappedUserId!.toLowerCase())) {
      res.status(502).json({ error: "Storage unavailable" }); return;
    }
    res.json({
      due: rows.map((r) => ({
        id: r.id,
        brainId: r.brain_id,
        topicId: r.topic_id,
        nextRecallAt: r.next_recall_at,
      })),
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Recall due fetch failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * GET /api/recall/history
 * Get recent recall events for the caller.
 */
router.get("/recall/history", async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  const limit = parseLimit(req.query.limit, 50, 200);
  if (limit === null) { res.status(400).json({ error: "Invalid limit" }); return; }

  try {
    const rows = await supabase.get<{
      id: string;
      user_id: string;
      brain_id: string | null;
      topic_id: string | null;
      quality: number;
      sm2_state_after: Sm2State;
      next_recall_at: string;
      recalled_at: string;
    }>("recall_events", {
      select: "id,user_id,brain_id,topic_id,quality,sm2_state_after,next_recall_at,recalled_at",
      filters: { user_id: `eq.${req.mappedUserId!}` },
      order: { column: "recalled_at", ascending: false },
      limit,
    });

    if (rows.some(row => typeof row.user_id !== "string" || row.user_id.toLowerCase() !== req.mappedUserId!.toLowerCase())) {
      res.status(502).json({ error: "Storage unavailable" }); return;
    }
    res.json({
      history: rows.map((r) => ({
        id: r.id,
        brainId: r.brain_id,
        topicId: r.topic_id,
        quality: r.quality,
        sm2State: r.sm2_state_after,
        nextRecallAt: r.next_recall_at,
        recalledAt: r.recalled_at,
      })),
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Recall history fetch failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

export default router;
