import { Router, type IRouter } from "express";
import { z } from "zod";
import { supabase, SupabaseError } from "../lib/supabase";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { requireRecentAuthentication } from "../middleware/recent-auth";
import { lookupMappedIdentity, requireMappedIdentity } from "../middleware/identity-map";

const router: IRouter = Router();

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  // B-3 fix: z.coerce.boolean() treats ANY non-empty string as true, so
  // `?mine=false` was coerced to true → guests got 401 instead of the public
  // list. Preprocess the raw string so only "true"/"1"/"yes" map to true.
  mine: z
    .preprocess((v) => {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return ["true", "1", "yes"].includes(v.toLowerCase());
      return false;
    }, z.boolean())
    .default(false),
});

interface BrainRow {
  id: string;
  author_id: string | null;
  title: string;
  category: string;
  description: string;
  root_node_id: string | null;
  is_public: boolean;
  is_favorite: boolean;
  repo_status: string | null;
  active_branch: string | null;
  created_at: string;
}

interface BrainNodeRow {
  id: string;
  brain_id: string;
  node_type: "question" | "outcome";
  question_text: string | null;
  result_text: string | null;
  next_steps: string | null;
  if_true_node_id: string | null;
  if_false_node_id: string | null;
  attachments: unknown;
}

function toClientBrain(row: BrainRow) {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    category: row.category,
    description: row.description,
    root_node_id: row.root_node_id,
    repo_status: row.repo_status,
    active_branch: row.active_branch,
    isFavorite: row.is_favorite,
    createdAt: new Date(row.created_at).getTime(),
    created_at: new Date(row.created_at).getTime(),
    isPublic: row.is_public,
  };
}

function toClientNode(row: BrainNodeRow) {
  return {
    id: row.id,
    brain_id: row.brain_id,
    node_type: row.node_type,
    question_text: row.question_text ?? undefined,
    result_text: row.result_text ?? undefined,
    next_steps: row.next_steps ?? undefined,
    if_true_node_id: row.if_true_node_id ?? null,
    if_false_node_id: row.if_false_node_id ?? null,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
  };
}

/** List public brains, or the signed-in user's own brains with ?mine=true. */
router.get("/brains", optionalAuth, async (req, res) => {
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.json({ brains: [], hasMore: false, source: "degraded" });
    return;
  }

  const { limit, offset, mine } = parsed.data;
  const filters: Record<string, string> = {};
  let mappedOwner: string | null = null;
  if (mine) {
    if (!req.auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      const mapped = await lookupMappedIdentity(req.auth.uid);
      if (!mapped) { res.status(403).json({ error: "Identity mapping required" }); return; }
      mappedOwner = mapped;
      filters.author_id = `eq.${mapped}`;
    } catch {
      res.status(503).json({ error: "Identity service unavailable" }); return;
    }
  } else {
    filters.is_public = "eq.true";
  }

  try {
    const rows = await supabase.get<BrainRow>("brains", {
      filters,
      order: { column: "created_at", ascending: false },
      limit: limit + 1,
      offset,
    });
    // This query uses a privileged client; never trust a malformed upstream
    // result to have obeyed the requested visibility/owner filter.
    if (rows.some(row => mine ? row.author_id?.toLowerCase() !== mappedOwner?.toLowerCase() : row.is_public !== true)) {
      res.set("Cache-Control", "no-store").status(502).json({ error: "Brains unavailable" }); return;
    }
    res.set("Cache-Control", "no-store").json({
      brains: rows.slice(0, limit).map(toClientBrain),
      hasMore: rows.length > limit,
      source: "supabase",
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      res.status(502).json({ error: "Brains unavailable" });
      return;
    }
    throw error;
  }
});

/** Fetch a single brain with all of its nodes. Public brains are readable by
 *  anyone; private brains only by their author. */
router.get("/brains/:id", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); }, optionalAuth, async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: "Invalid brain id" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Brains not configured" });
    return;
  }
  try {
    // One SQL statement returns an authorized brain and its nodes from the
    // same snapshot; separate service-role reads could cross a privacy change.
    type Detail = { brain: BrainRow; nodes: BrainNodeRow[] };
    let detail = await supabase.rpc<Detail | null>("read_brain_detail_v2", { p_id: id, p_uid: null });
    if (!detail && req.auth) {
      let mapped: string | null;
      try { mapped = await lookupMappedIdentity(req.auth.uid); }
      catch { res.status(503).json({ error: "Identity service unavailable" }); return; }
      if (mapped) detail = await supabase.rpc<Detail | null>("read_brain_detail_v2", { p_id: id, p_uid: mapped });
    }
    if (!detail) { res.status(404).json({ error: "Brain not found" }); return; }
    res.json({ brain: toClientBrain(detail.brain), nodes: detail.nodes.map(toClientNode), source: "supabase" });
  } catch (error) {
    if (error instanceof SupabaseError) {
      res.status(502).json({ error: "Brain unavailable" });
      return;
    }
    throw error;
  }
});

/** The legacy full-snapshot writer cannot detect concurrent edits or retain
 * all rich fields. Never invoke it from this mounted API, even if the RPC is
 * present and the caller has an identity mapping. */
router.post("/brains", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json({ error: "Cloud brain saving temporarily unavailable" });
});

/** Delete a brain (author only). Cascades to nodes via the schema. */
router.delete("/brains/:id", requireAuth, requireRecentAuthentication, requireMappedIdentity, async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: "Invalid brain id" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Brains not configured" });
    return;
  }
  try {
    const existing = await supabase.getOne<BrainRow>("brains", {
      filters: { id: `eq.${id}` },
    });
    if (!existing) {
      res.status(404).json({ error: "Brain not found" });
      return;
    }
    if (existing.author_id !== req.mappedUserId) {
      res.status(403).json({ error: "You do not own this brain" });
      return;
    }
    // Keep the ownership predicate on the actual write as well as the probe.
    await supabase.delete("brains", { id: existing.id, author_id: req.mappedUserId! });
    res.status(204).end();
  } catch (error) {
    if (error instanceof SupabaseError) {
      res.status(502).json({ error: "Could not delete brain" });
      return;
    }
    throw error;
  }
});

export default router;
