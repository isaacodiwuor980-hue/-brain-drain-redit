import { Router, type IRouter } from "express";
const router: IRouter = Router();
// Hard-disabled while identity, visibility, moderation and ranking quality are
// unverified. Cooperating online clients see false; old/offline clients may
// ignore this endpoint. This is not an authorization or security boundary.
router.get("/tsrg/status", (_req, res) => {
  res.setHeader("X-Kill-Switch-Scope", "online-clients-only");
  res.setHeader("Cache-Control", "no-store");
  res.json({ experimental_feed_available: false, checked_at: new Date().toISOString(), scope: "online-clients-only" });
});
export default router;
