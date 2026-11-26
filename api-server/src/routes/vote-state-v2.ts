import { Router, type IRouter, type RequestHandler } from "express";
import { requireAuth } from "../middleware/auth";
import { requireRecentAuthentication } from "../middleware/recent-auth";
import { requireMappedIdentity } from "../middleware/identity-map";
import { requireServerFeature } from "../middleware/server-feature-flag";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

/**
 * Experimental, default-off read adapter. The named RPC does not yet exist in
 * the repository or live database. Do not enable this route until the RPC can
 * atomically authorize post visibility, return a consistent own vote/revision,
 * fail on ambiguous legacy state, and all writers cooperate with the revision.
 * The route returns 503 even when the flag is on: changing a flag cannot enable
 * an unreviewed RPC. Service-role access bypasses RLS: the unmounted adapter is
 * NOT an authorization or privacy boundary. No automatic replay occurs.
 */
router.get("/posts/:id/vote-state-v2",
  (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); },
  requireServerFeature("vote_state_v2"), requireAuth, requireRecentAuthentication, requireMappedIdentity,
  (_req, res) => { res.status(503).json({error: "Vote status unavailable"}); },
);

/** Unmounted experimental adapter, retained for synthetic tests only. */
export const voteStateReadAdapterForTests: RequestHandler = async (req, res) => {
    const postId = String(req.params.id ?? "");
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(postId)) { res.status(400).json({error: "Invalid post id"}); return; }
    try {
      const result = await supabase.rpc<unknown>("experimental_get_own_vote_v2", {p_uid: req.mappedUserId, p_post_id: postId});
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid vote state");
      const row = result as {vote?: unknown; revision?: unknown};
      if (!(row.vote === null || row.vote === "upvote" || row.vote === "downvote") ||
          typeof row.revision !== "number" || !Number.isSafeInteger(row.revision) || row.revision < 0) throw new Error("Invalid vote state");
      res.json({vote: row.vote, revision: row.revision});
    } catch {
      // No caller IDs, tokens, post IDs, SQL or upstream error details in logs.
      res.status(503).json({error: "Vote status unavailable"});
    }
};
export default router;
