import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireMappedIdentity } from "../middleware/identity-map";
import { requireServerFeature } from "../middleware/server-feature-flag";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();
const input = z.object({ enabled: z.boolean() }).strict();
const requireEnableFlag = requireServerFeature("feed_interest_tracking_v2");

// These controls affect ONLY the proposed interest tables, not existing
// analytics, browser caches, the old feed, backups or other derived data.
// Never use them to claim that site-wide tracking has been turned off/cleared.
router.use("/feed-privacy", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Privacy-Scope", "proposed-feed-interests-only");
  next();
}, requireAuth, requireMappedIdentity);

router.get("/feed-privacy", async (req, res) => {
  try {
    const row = await supabase.getOne<{ enabled: boolean }>("feed_personalization_preferences", {
      select: "enabled", filters: { user_id: `eq.${req.mappedUserId}` },
    });
    if (row && typeof row.enabled !== "boolean") throw new Error("Invalid preference");
    res.json({ enabled: row?.enabled ?? false, scope: "proposed-feed-interests-only" });
  } catch { res.status(503).json({ error: "Privacy service unavailable" }); }
});

router.put("/feed-privacy", (req, res, next) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid preference" }); return; }
  // Turning off must remain possible when the kill switch is off. Enabling
  // always requires the server-side flag; requests cannot supply identity.
  if (parsed.data.enabled) { void requireEnableFlag(req, res, next); return; }
  next();
}, async (req, res) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid preference" }); return; }
  try {
    await supabase.rpc("feed_set_personalization", { p_uid: req.mappedUserId, p_enabled: parsed.data.enabled });
    res.status(204).end();
  } catch { res.status(503).json({ error: "Privacy service unavailable" }); }
});

router.delete("/feed-privacy", async (req, res) => {
  try {
    await supabase.rpc("feed_clear_interests", { p_uid: req.mappedUserId });
    res.status(204).end();
  } catch { res.status(503).json({ error: "Privacy service unavailable" }); }
});

export default router;
