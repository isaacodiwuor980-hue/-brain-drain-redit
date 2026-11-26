import { Router, type IRouter } from "express";
import { z } from "zod";
import { supabase, SupabaseError } from "../lib/supabase";
import { optionalAuth, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const NodeSchema = z.object({
  id: z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/, "id must be a slug"),
  mind_id: z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/, "mind_id must be a slug"),
  node_type: z.enum(["question", "outcome"]),
  question_text: z.string().max(5000).nullable().optional(),
  result_text: z.string().max(5000).nullable().optional(),
  next_steps: z.string().max(10000).nullable().optional(),
  if_true_node_id: z.string().max(120).nullable().optional(),
  if_false_node_id: z.string().max(120).nullable().optional(),
  attachments: z.array(z.unknown()).default([]),
});

const Mindschema = z.object({
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

interface MindRow {
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

interface MindNodeRow {
  id: string;
  mind_id: string;
  node_type: "question" | "outcome";
  question_text: string | null;
  result_text: string | null;
  next_steps: string | null;
  if_true_node_id: string | null;
  if_false_node_id: string | null;
  attachments: unknown;
}

function toClientMind(row: MindRow) {
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
    isPublic: row.is_public,
  };
}

function toClientNode(row: MindNodeRow) {
  return {
    id: row.id,
    mind_id: row.mind_id,
    node_type: row.node_type,
    question_text: row.question_text ?? undefined,
    result_text: row.result_text ?? undefined,
    next_steps: row.next_steps ?? undefined,
    if_true_node_id: row.if_true_node_id ?? null,
    if_false_node_id: row.if_false_node_id ?? null,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
  };
}

/** List public minds, or the signed-in user's own minds with ?mine=true. */
router.get("/minds", optionalAuth, async (req, res) => {
  const parsed = ListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.json({ minds: [], hasMore: false, source: "degraded" });
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
    const rows = await supabase.get<MindRow>("minds", {
      filters,
      order: { column: "created_at", ascending: false },
      limit: limit + 1,
      offset,
    });
    res.json({
      minds: rows.slice(0, limit).map(toClientMind),
      hasMore: rows.length > limit,
      source: "supabase",
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      res.status(502).json({ error: "Minds unavailable" });
      return;
    }
    throw error;
  }
});

/** Fetch a single mind with all of its nodes. Public minds are readable by
 *  anyone; private minds only by their author. */
router.get("/minds/:id", optionalAuth, async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: "Invalid mind id" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Minds not configured" });
    return;
  }
  try {
    const mind = await supabase.getOne<MindRow>("minds", {
      filters: { id: `eq.${req.params.id}` },
    });
    if (!mind) {
      res.status(404).json({ error: "Mind not found" });
      return;
    }
    // Security: enforce visibility. Private minds are only accessible to their owner.
    // repo_status "private" or null = private; "public_repo" = public; "archived" = read-only public.
    const isPrivate = !mind.is_public && mind.repo_status !== "public_repo" && mind.repo_status !== "archived";
    if (isPrivate && mind.author_id !== req.auth?.uid) {
      res.status(404).json({ error: "Mind not found" });
      return;
    }

    const nodes = await supabase.get<MindNodeRow>("mind_nodes", {
      filters: { mind_id: `eq.${mind.id}` },
    });

    res.json({
      mind: toClientMind(mind),
      nodes: nodes.map(toClientNode),
      source: "supabase",
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      res.status(502).json({ error: "Mind unavailable" });
      return;
    }
    throw error;
  }
});

const UpsertMindschema = z.object({
  mind: Mindschema,
  nodes: z.array(NodeSchema).max(500),
});

/** Create or update a mind and its nodes in one transaction-like call.
 *  Nodes are replaced wholesale to keep the client/server topology simple. */
router.post("/minds", requireAuth, async (req, res) => {
  const parsed = UpsertMindschema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid mind", details: parsed.error.flatten() });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Minds not configured" });
    return;
  }

  const { mind: input, nodes } = parsed.data;
  const uid = req.auth!.uid;

  try {
    // Check ownership if the mind already exists.
    const existing = await supabase.getOne<MindRow>("minds", {
      filters: { id: `eq.${input.id}` },
    });
    if (existing && existing.author_id !== uid) {
      res.status(403).json({ error: "You do not own this mind" });
      return;
    }

    const mindRow = {
      id: input.id,
      author_id: uid,
      title: input.title,
      category: input.category,
      description: input.description,
      root_node_id: input.root_node_id ?? null,
      is_public: input.is_public,
      is_favorite: input.is_favorite,
      repo_status: input.repo_status ?? null,
      active_branch: input.active_branch ?? null,
    };

    await supabase.insert("minds", mindRow, "resolution=merge-duplicates");

    // Replace nodes safely: insert/upsert the new set FIRST, then delete any
    // old nodes that are not part of the new set. This avoids a window where
    // a failed insert would leave the mind with no nodes at all.
    if (nodes.length > 0) {
      await supabase.insert(
        "mind_nodes",
        nodes.map((n) => ({
          id: n.id,
          mind_id: mindRow.id,
          node_type: n.node_type,
          question_text: n.question_text ?? null,
          result_text: n.result_text ?? null,
          next_steps: n.next_steps ?? null,
          if_true_node_id: n.if_true_node_id ?? null,
          if_false_node_id: n.if_false_node_id ?? null,
          attachments: n.attachments ?? [],
        })),
        "resolution=merge-duplicates",
      );
    }

    // Delete stale nodes belonging to this mind that were not in the upsert.
    // PostgREST filters with `not.in.(...)`; an empty new set deletes all.
    const newIds = nodes.map((n) => n.id);
    if (newIds.length > 0) {
      await supabase.deleteNotIn(
        "mind_nodes",
        { mind_id: mindRow.id },
        "id",
        newIds,
      );
    } else {
      await supabase.delete("mind_nodes", { mind_id: mindRow.id });
    }

    res.status(existing ? 200 : 201).json({
      mind: toClientMind({
        ...mindRow,
        created_at: existing?.created_at ?? new Date().toISOString(),
      } as MindRow),
      nodeCount: nodes.length,
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      res.status(502).json({ error: "Could not save mind" });
      return;
    }
    throw error;
  }
});

/** Delete a mind (author only). Cascades to nodes via the schema. */
router.delete("/minds/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id ?? "");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: "Invalid mind id" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Minds not configured" });
    return;
  }
  try {
    const existing = await supabase.getOne<MindRow>("minds", {
      filters: { id: `eq.${id}` },
    });
    if (!existing) {
      res.status(404).json({ error: "Mind not found" });
      return;
    }
    if (existing.author_id !== req.auth!.uid) {
      res.status(403).json({ error: "You do not own this mind" });
      return;
    }
    await supabase.delete("minds", { id: existing.id });
    res.status(204).end();
  } catch (error) {
    if (error instanceof SupabaseError) {
      res.status(502).json({ error: "Could not delete mind" });
      return;
    }
    throw error;
  }
});

export default router;
