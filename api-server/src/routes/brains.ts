import { Router, type IRouter } from "express";
import { z } from "zod";
import { supabase, SupabaseError } from "../lib/supabase";
import { optionalAuth, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const NodeSchema = z.object({
  id: z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/, "id must be a slug"),
  brain_id: z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/, "brain_id must be a slug"),
  node_type: z.enum(["question", "outcome"]),
  question_text: z.string().max(5000).nullable().optional(),
  result_text: z.string().max(5000).nullable().optional(),
  next_steps: z.string().max(10000).nullable().optional(),
  if_true_node_id: z.string().max(120).nullable().optional(),
  if_false_node_id: z.string().max(120).nullable().optional(),
  attachments: z.array(z.unknown()).default([]),
});

const BrainSchema = z.object({
  id: z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/, "id must be a slug"),
  title: z.string().min(1).max(200),
  category: z.string().max(200).default(""),
  description: z.string().max(5000).default(""),
  root_node_id: z.string().max(120).nullable().optional(),
  is_public: z.boolean().default(false),
  is_favorite: z.boolean().default(false),
  repo_status: z.enum(["private", "public_repo"]).nullable().optional(),
  active_branch: z.string().max(120).nullable().optional(),
});

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
  if (mine) {
    if (!req.auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    filters.author_id = `eq.${req.auth.uid}`;
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
    res.json({
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
router.get("/brains/:id", optionalAuth, async (req, res) => {
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
    const brain = await supabase.getOne<BrainRow>("brains", {
      filters: { id: `eq.${req.params.id}` },
    });
    if (!brain) {
      res.status(404).json({ error: "Brain not found" });
      return;
    }
    // Security: enforce visibility. Private brains are only accessible to their owner.
    // repo_status "private" or null = private; "public_repo" = public; "archived" = read-only public.
    const isPrivate = !brain.is_public && brain.repo_status !== "public_repo" && brain.repo_status !== "archived";
    if (isPrivate && brain.author_id !== req.auth?.uid) {
      res.status(404).json({ error: "Brain not found" });
      return;
    }

    const nodes = await supabase.get<BrainNodeRow>("brain_nodes", {
      filters: { brain_id: `eq.${brain.id}` },
    });

    res.json({
      brain: toClientBrain(brain),
      nodes: nodes.map(toClientNode),
      source: "supabase",
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      res.status(502).json({ error: "Brain unavailable" });
      return;
    }
    throw error;
  }
});

const UpsertBrainSchema = z.object({
  brain: BrainSchema,
  nodes: z.array(NodeSchema).max(500),
});

/** Atomically create or update an owned brain and replace its nodes. */
router.post("/brains", requireAuth, async (req, res) => {
  const parsed = UpsertBrainSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid brain", details: parsed.error.flatten() });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Brains not configured" });
    return;
  }

  const { brain: input, nodes } = parsed.data;
  const uid = req.auth!.uid;

  try {
    // One database transaction enforces ownership and replaces the node set.
    // If migration 0005 has not been deployed, fail closed instead of falling
    // back to the old service-role read/check/upsert race.
    const result = await supabase.rpc<{ brain: BrainRow; created: boolean; nodeCount: number }>(
      "save_brain_atomic",
      { p_uid: uid, p_brain: input, p_nodes: nodes },
    );
    res.status(result.created ? 201 : 200).json({
      brain: toClientBrain(result.brain),
      nodeCount: result.nodeCount,
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      let code: unknown;
      try {
        const body = typeof error.body === "string" ? JSON.parse(error.body) : error.body;
        code = (body as { code?: unknown } | null)?.code;
      } catch { /* malformed upstream error */ }
      if (code === "42501") {
        res.status(403).json({ error: "Brain or node ownership conflict" });
      } else if (code === "22023") {
        res.status(400).json({ error: "Invalid brain topology" });
      } else {
        res.status(502).json({ error: "Could not save brain" });
      }
      return;
    }
    throw error;
  }
});

/** Delete a brain (author only). Cascades to nodes via the schema. */
router.delete("/brains/:id", requireAuth, async (req, res) => {
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
    if (existing.author_id !== req.auth!.uid) {
      res.status(403).json({ error: "You do not own this brain" });
      return;
    }
    // Keep the ownership predicate on the actual write as well as the probe.
    await supabase.delete("brains", { id: existing.id, author_id: req.auth!.uid });
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
