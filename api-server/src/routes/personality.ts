/**
 * api-server/src/routes/personality.ts — BFI-10 personality test scoring.
 *
 * BFI-10 (Rammstedt & John, 2007): 10 items, 2 per trait, 1-5 Likert.
 * Each trait has one normally-keyed item and one reverse-keyed item.
 *
 * Items (standard BFI-10 wording, shortened):
 *   e1:  "Talkative"                    (Extraversion +)
 *   e2r: "Reserved"                     (Extraversion -, reverse-keyed)
 *   a1:  "Generally trusting"           (Agreeableness +)
 *   a2r: "Tends to find fault"          (Agreeableness -, reverse-keyed)
 *   c1:  "Does a thorough job"          (Conscientiousness +)
 *   c2r: "Tends to be lazy"             (Conscientiousness -, reverse-keyed)
 *   n1:  "Relaxed, handles stress well" (Neuroticism -, reverse-keyed)
 *   n2r: "Gets nervous easily"          (Neuroticism +)
 *   o1:  "Has an active imagination"    (Openness +)
 *   o2r: "Few artistic interests"       (Openness -, reverse-keyed)
 *
 * Scoring per trait: (item1 + (6 - reverseItem)) / 2 -> range 1.0-5.0.
 */
import { Router, type IRouter } from "express";
import { z } from "zod";
import { supabase, SupabaseError } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// Each item is 1-5 Likert.
const ItemSchema = z.number().int().min(1).max(5);

const ResponsesSchema = z.object({
  e1: ItemSchema,
  e2r: ItemSchema,
  a1: ItemSchema,
  a2r: ItemSchema,
  c1: ItemSchema,
  c2r: ItemSchema,
  n1: ItemSchema,
  n2r: ItemSchema,
  o1: ItemSchema,
  o2r: ItemSchema,
});

const SubmitSchema = z.object({
  responses: ResponsesSchema,
});

interface PersonalityResultRow {
  id: string;
  extraversion: string;
  agreeableness: string;
  conscientiousness: string;
  neuroticism: string;
  openness: string;
  test_version: string;
  created_at: string;
}

/**
 * Score the 10 responses into 5 trait scores.
 * Reverse-keyed items: e2r, a2r, c2r, n1, o2r.
 * Per trait: (normal + (6 - reverse)) / 2.
 */
function scoreBfi10(r: z.infer<typeof ResponsesSchema>) {
  return {
    extraversion: ((r.e1 + (6 - r.e2r)) / 2).toFixed(2),
    agreeableness: ((r.a1 + (6 - r.a2r)) / 2).toFixed(2),
    conscientiousness: ((r.c1 + (6 - r.c2r)) / 2).toFixed(2),
    neuroticism: ((r.n2r + (6 - r.n1)) / 2).toFixed(2),
    openness: ((r.o1 + (6 - r.o2r)) / 2).toFixed(2),
  };
}

/**
 * POST /api/personality/submit
 * Submit BFI-10 responses, get scored, persist results. Returns the
 * computed trait scores. Each user can submit multiple times (re-tests);
 * the most recent is considered their "current" personality.
 */
router.post("/personality/submit", requireAuth, async (req, res) => {
  const parsed = SubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid responses", details: parsed.error.flatten() });
    return;
  }

  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  const scores = scoreBfi10(parsed.data.responses);

  try {
    await supabase.insert("personality_results", {
      user_id: req.auth!.uid,
      responses: parsed.data.responses,
      extraversion: scores.extraversion,
      agreeableness: scores.agreeableness,
      conscientiousness: scores.conscientiousness,
      neuroticism: scores.neuroticism,
      openness: scores.openness,
      test_version: "bfi-10",
    });

    res.json({
      ok: true,
      scores,
      testVersion: "bfi-10",
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ err: error }, "Personality submit failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * GET /api/personality
 * Returns the caller's most recent personality result (or null if none).
 */
router.get("/personality", requireAuth, async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const row = await supabase.getOne<PersonalityResultRow>("personality_results", {
      select: "id,extraversion,agreeableness,conscientiousness,neuroticism,openness,test_version,created_at",
      filters: { user_id: `eq.${req.auth!.uid}` },
      order: { column: "created_at", ascending: false },
    });

    if (!row) {
      res.json(null);
      return;
    }

    res.json({
      id: row.id,
      extraversion: Number(row.extraversion),
      agreeableness: Number(row.agreeableness),
      conscientiousness: Number(row.conscientiousness),
      neuroticism: Number(row.neuroticism),
      openness: Number(row.openness),
      testVersion: row.test_version,
      createdAt: row.created_at,
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ err: error }, "Personality fetch failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

export default router;
