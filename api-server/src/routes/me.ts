import { Router, type IRouter } from "express";
import { requireAuth } from "../middleware/auth";
import { mappedIdentity } from "../middleware/identity-map";

const router: IRouter = Router();
// Only expose the caller's mapped UUID; do not fall back to a guessed ID.
router.get("/me", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); }, requireAuth, mappedIdentity(401), (req, res) => {
  res.json({ uid: req.mappedUserId, mapped: true });
});
export default router;
