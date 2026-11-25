import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireMappedIdentity } from "../middleware/identity-map";
import { requireServerFeature } from "../middleware/server-feature-flag";
import { supabase, SupabaseError } from "../lib/supabase";

// Experimental endpoint. Not for enabling against existing brain data: the
// backing SQL is local-only, and all ordinary/privileged writers must first
// participate in the same ownership and version protocol.
const router: IRouter = Router();
const input = z.object({
  brainId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
  operationId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  snapshot: z.record(z.string(), z.unknown()),
}).strict();

router.post("/experimental/brain-sync", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store"); next();
}, requireServerFeature("brain_sync_experiment"), requireAuth, requireMappedIdentity, async (req, res) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success || parsed.data.snapshot.id !== parsed.data.brainId) {
    res.status(400).json({error:"Invalid sync request"}); return;
  }
  const {brainId, operationId, expectedRevision, snapshot} = parsed.data;
  // Match the experiment's database size ceiling; do not persist malformed or
  // oversized snapshots. Complete structural and attachment checks are pending.
  if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > 1_048_576) {
    res.status(413).json({error:"Sync request too large"}); return;
  }
  try {
    const result = await supabase.rpc<{revision: unknown; replayed: unknown}>("brain_sync_save_experiment", {
      p_owner: req.mappedUserId, p_brain_id: brainId, p_operation: operationId,
      p_expected: expectedRevision, p_snapshot: snapshot,
    });
    if (!result || result.revision !== expectedRevision + 1 || typeof result.replayed !== "boolean") {
      res.status(503).json({error:"Sync status unconfirmed"}); return;
    }
    res.json({revision: result.revision, replayed: result.replayed});
  } catch (error) {
    let code: unknown;
    if (error instanceof SupabaseError && typeof error.body === "string") {
      try { code = (JSON.parse(error.body) as {code?: unknown}).code; } catch { /* hide upstream details */ }
    }
    if (code === "40001") { res.status(409).json({error:"Brain version conflict"}); return; }
    if (code === "22023") { res.status(400).json({error:"Sync request rejected"}); return; }
    // An error or timeout may mean the write committed. Preserve the pending
    // operation and exact payload; do not treat this response as a failure to save.
    res.status(503).json({error:"Sync status unconfirmed"});
  }
});
export default router;
