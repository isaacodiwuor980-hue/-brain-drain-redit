import { Router, type IRouter } from "express";
import { z } from "zod";

const router: IRouter = Router();

/**
 * This legacy endpoint previously ranked the process-wide analytics buffer,
 * without checking brain visibility or account ownership. That could disclose
 * private brain IDs and another person's activity to anonymous callers. Keep
 * the response shape and 200 status, but fail closed with an explicit disabled
 * status until an ownership-checked recommendation service is implemented.
 * Zero signal counts here mean NOT MEASURED, not that no activity exists.
 * This does not delete any stored analytics or implement feed personalization.
 */
router.get("/recommendations/brains", (req, res) => {
  const parsed = z.coerce.number().int().min(1).max(25).safeParse(req.query.limit ?? 10);
  const limit = parsed.success ? parsed.data : 10;
  res.setHeader("Cache-Control", "no-store");
  res.json({
    generatedAt: new Date().toISOString(),
    source: {
      apiStyle: "flexible-product-api",
      primaryBackendTarget: "supabase-postgres",
      currentStorage: "unavailable",
      currentMode: "disabled",
    },
    limit,
    readinessScore: 0,
    signalSummary: { directBrainSignals: 0, launchSignals: 0, searchSignals: 0, postSignals: 0 },
    recommendations: [],
    fallback: {
      needsSupabaseMetadata: true,
      message: "Recommendations are disabled until privacy and ownership can be verified. Signal counts are not measured.",
    },
    nextBackendStep: "Implement privacy-reviewed, ownership-scoped recommendations before enabling this endpoint.",
  });
});

export default router;
