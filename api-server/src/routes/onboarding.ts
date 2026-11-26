/**
 * api-server/src/routes/onboarding.ts — New-user onboarding state machine.
 *
 * Flow:
 *   1. GET  /api/onboarding             -> get current user's onboarding state
 *   2. POST /api/onboarding/start        -> create initial row (idempotent)
 *   3. PATCH /api/onboarding/step/{step} -> temporarily unavailable
 *
 * State machine (see migration 0004):
 *   profile -> interests -> personality -> experts -> done
 *
 * Each step has its own completion timestamp; advancing to a new step
 * stamps the previous step's *_completed_at. The client can also write
 * free-form data to the scratch JSONB column for mid-flow persistence.
 */
import { Router, type IRouter } from "express";
import { supabase, SupabaseError } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { requireMappedIdentity } from "../middleware/identity-map";

const router: IRouter = Router();
router.use("/onboarding", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); }, requireAuth, requireMappedIdentity);

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

/**
 * GET /api/onboarding
 * Returns the caller's onboarding state. If no row exists yet, returns
 * a default state (current_step='profile', nothing completed) without
 * creating one — call POST /api/onboarding/start to persist.
 */
router.get("/onboarding", async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    const row = await supabase.getOne<OnboardingRow>("onboarding", {
      select: "user_id,current_step,profile_completed_at,interests_completed_at,personality_completed_at,experts_completed_at,completed_at,scratch",
      filters: { user_id: `eq.${req.mappedUserId!}` },
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

    if (typeof row.user_id !== "string" || row.user_id.toLowerCase() !== req.mappedUserId!.toLowerCase()) {
      res.status(502).json({ error: "Storage unavailable" }); return;
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
      req.log?.error?.({ status: error.status }, "Onboarding fetch failed");
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
router.post("/onboarding/start", async (req, res) => {
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Storage not configured" });
    return;
  }

  try {
    // Check if a row exists first (insert would fail on PK conflict).
    const existing = await supabase.getOne<OnboardingRow>("onboarding", {
      select: "user_id,current_step",
      filters: { user_id: `eq.${req.mappedUserId!}` },
    });

    if (existing) {
      if (typeof existing.user_id !== "string" || existing.user_id.toLowerCase() !== req.mappedUserId!.toLowerCase()) {
        res.status(502).json({ error: "Storage unavailable" }); return;
      }
      res.json({ ok: true, currentStep: existing.current_step, existed: true });
      return;
    }

    await supabase.insert("onboarding", {
      user_id: req.mappedUserId!,
      current_step: "profile",
    });

    res.json({ ok: true, currentStep: "profile", existed: false });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Onboarding start failed");
      res.status(502).json({ error: "Storage unavailable" });
      return;
    }
    throw error;
  }
});

/** Existing scratch updates are full replacements with no revision. An
 * out-of-order client can erase newer work; pause until a versioned write and
 * conflict recovery are implemented. No update or retry is attempted here. */
router.patch("/onboarding/step/:step", (_req, res) => {
  res.status(503).json({ error: "Onboarding updates temporarily unavailable" });
});

export default router;
