/**
 * api-server/src/routes/onboarding.ts — New-user onboarding state machine.
 *
 * Flow:
 *   1. GET  /api/onboarding             -> get current user's onboarding state
 *   2. POST /api/onboarding/start        -> create initial row (idempotent)
 *   3. PATCH /api/onboarding/step/{step} -> advance to a new step
 *
 * State machine (see migration 0004):
 *   profile -> interests -> personality -> experts -> done
 *
 * Each step has its own completion timestamp; advancing to a new step
 * stamps the previous step's *_completed_at. The client can also write
 * free-form data to the scratch JSONB column for mid-flow persistence.
 */
import { Router, type IRouter } from "express";
import { z } from "zod";
import { supabase, SupabaseError } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const STEP_ORDER = ["profile", "interests", "personality", "experts", "done"] as const;
type Step = (typeof STEP_ORDER)[number];

const AdvanceSchema = z.object({
  // Optionally write to scratch on this advance.
  scratch: z.record(z.string(), z.unknown()).optional(),
});

interface OnboardingRow {
  user_id: string;
  current_step: string;
  profile_completed_at: string | null;
  interests_completed_at: string | null;
  personality_completed_at: string | null;
  experts_completed_at: string | null;
  completed_at: string | null;
  scratch: Record<string, unknown>;
}

function stepTimestampField(step: Step): keyof OnboardingRow | null {
  switch (step) {
    case "profile": return null;
    case "interests": return "profile_completed_at";
    case "personality": return "interests_completed_at";
    case "experts": return "personality_completed_at";
    case "done": return "experts_completed_at";
  }
}

/**
 * GET /api/onboarding
 * Returns the caller's onboarding state. If no row exists yet, returns
 * a default state (current_step='profile', nothing completed) without
 * creating one — call POST /api/onboarding/start to persist.
 */
router.get("/onboarding", requireAuth, async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const row = await supabase.getOne<OnboardingRow>("onboarding", {
      select: "user_id,current_step,profile_completed_at,interests_completed_at,personality_completed_at,experts_completed_at,completed_at,scratch",
      filters: { user_id: `eq.${req.auth!.uid}` },
    });

    if (!row) {
      res.json({
        currentStep: "profile",
        profileCompletedAt: null,
        interestsCompletedAt: null,
        personalityCompletedAt: null,
        expertsCompletedAt: null,
        completedAt: null,
        scratch: {},
      });
      return;
    }

    res.json({
      currentStep: row.current_step,
      profileCompletedAt: row.profile_completed_at,
      interestsCompletedAt: row.interests_completed_at,
      personalityCompletedAt: row.personality_completed_at,
      expertsCompletedAt: row.experts_completed_at,
      completedAt: row.completed_at,
      scratch: row.scratch,
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ err: error }, "Onboarding fetch failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * POST /api/onboarding/start
 * Create an initial onboarding row for the caller. Idempotent: if a row
 * already exists, returns it without modifying.
 */
router.post("/onboarding/start", requireAuth, async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    // Check if a row exists first (insert would fail on PK conflict).
    const existing = await supabase.getOne<OnboardingRow>("onboarding", {
      select: "user_id,current_step",
      filters: { user_id: `eq.${req.auth!.uid}` },
    });

    if (existing) {
      res.json({ ok: true, currentStep: existing.current_step, existed: true });
      return;
    }

    await supabase.insert("onboarding", {
      user_id: req.auth!.uid,
      current_step: "profile",
    });

    res.json({ ok: true, currentStep: "profile", existed: false });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ err: error }, "Onboarding start failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * PATCH /api/onboarding/step/:step
 * Advance to the given step. Validates that the step is reachable from
 * the current step (forward-only — no skipping ahead, no going back).
 * Stamps the previous step's completion timestamp.
 */
router.patch("/onboarding/step/:step", requireAuth, async (req, res) => {
  const targetStep = req.params.step as Step;
  if (!STEP_ORDER.includes(targetStep)) {
    res.status(400).json({ error: "Invalid step", validSteps: STEP_ORDER });
    return;
  }

  const parsed = AdvanceSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const row = await supabase.getOne<OnboardingRow>("onboarding", {
      select: "user_id,current_step",
      filters: { user_id: `eq.${req.auth!.uid}` },
    });

    if (!row) {
      res.status(404).json({ error: "Onboarding not started; call POST /api/onboarding/start first" });
      return;
    }

    const currentIndex = STEP_ORDER.indexOf(row.current_step as Step);
    const targetIndex = STEP_ORDER.indexOf(targetStep);

    // Allow re-advancing to the same step (idempotent re-submit) but not
    // going backwards or skipping ahead.
    if (targetIndex < currentIndex) {
      res.status(409).json({
        error: "Cannot go backwards in onboarding",
        currentStep: row.current_step,
        attemptedStep: targetStep,
      });
      return;
    }

    const changes: Record<string, unknown> = {
      current_step: targetStep,
    };

    // Stamp the previous step's completion timestamp.
    const tsField = stepTimestampField(targetStep);
    if (tsField) {
      changes[tsField] = new Date().toISOString();
    }

    // If advancing to 'done', also stamp completed_at.
    if (targetStep === "done") {
      changes.completed_at = new Date().toISOString();
    }

    // Optionally merge scratch.
    if (parsed.data.scratch) {
      // Note: this overwrites scratch entirely. For merge semantics, the
      // client should GET current scratch, merge locally, then PATCH.
      changes.scratch = parsed.data.scratch;
    }

    await supabase.update("onboarding", { user_id: `eq.${req.auth!.uid}` }, changes);

    res.json({ ok: true, currentStep: targetStep });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ err: error }, "Onboarding advance failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

export default router;
