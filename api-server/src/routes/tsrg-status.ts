import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
const router: IRouter = Router();
// Soft kill switch for cooperating online clients only; old or offline clients
// can still rank locally. This is NOT an absolute or security kill switch.
router.get("/tsrg/status", async (_req, res) => {
  res.setHeader("X-Kill-Switch-Scope", "online-clients-only");
  res.setHeader("Cache-Control", "no-store");
  let available = false;
  try {
    if (supabase.isConfigured()) {
      // Reuse the actual seed name in 0007, not a second disconnected flag.
      const flag = await supabase.getOne<{ enabled: boolean }>("server_feature_flags", { select: "enabled", filters: { name: "eq.experimental_tsrg_feed" } });
      available = flag?.enabled === true;
    }
  } catch { /* Fail closed; do not log upstream data or credentials. */ }
  res.json({ experimental_feed_available: available, checked_at: new Date().toISOString(), scope: "online-clients-only" });
});
export default router;
