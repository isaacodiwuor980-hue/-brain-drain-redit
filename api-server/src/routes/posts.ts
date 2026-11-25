import { Router, type IRouter, type RequestHandler } from "express";
import { z } from "zod";
import { supabase, SupabaseError } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

const CreatePostSchema = z.object({
  id: z.string().min(1).max(120),
  topicId: z.string().min(1).max(80),
  content: z.string().min(1).max(10_000),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  postType: z.enum(["post", "question", "answer"]).default("post"),
  event: z
    .object({
      title: z.string().max(200),
      startsAt: z.number().int().positive(),
      endsAt: z.number().int().positive().optional(),
      location: z.string().max(200).optional(),
      communityId: z.string().max(80).optional(),
      communityName: z.string().max(200).optional(),
    })
    .optional(),
  mediaUrls: z.array(z.string().url().max(2000)).max(10).optional(),
  // PostgREST filters below accept only simple IDs, not filter syntax.
  brainId: z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/).optional(),
  // Date.toISOString throws outside the JavaScript Date range.
  createdAt: z.number().int().positive().max(8_640_000_000_000_000).optional(),
});

const ReactSchema = z.object({
  reactionType: z.enum(["upvote", "downvote", "repost"]),
});

/**
 * Create a post. Authenticated users only. Posts are written to Supabase and
 * also reflected back to the client for optimistic IndexedDB caching.
 */
router.post("/posts", requireAuth, async (req, res) => {
  const parsed = CreatePostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid post", details: parsed.error.flatten() });
    return;
  }

  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Post storage is not configured" });
    return;
  }

  const { auth } = req;
  const input = parsed.data;

  if (input.brainId) {
    // Posts are currently public; never deliberately attach an unconfirmed or
    // private brain through this API. Identical errors avoid an existence oracle.
    // This separate lookup is not atomic with the insert or a visibility change;
    // direct database writers and existing posts need independent protection.
    try {
      const brain = await supabase.getOne<{ id: string; is_public: boolean }>("brains", {
        select: "id,is_public", filters: { id: `eq.${input.brainId}`, is_public: "eq.true" },
      });
      if (!brain || brain.id !== input.brainId || brain.is_public !== true) {
        res.status(400).json({ error: "Brain attachment unavailable" }); return;
      }
    } catch {
      res.status(503).json({ error: "Brain attachment unavailable" }); return;
    }
  }

  const row = {
    id: input.id,
    user_id: auth!.uid,
    topic_id: input.topicId,
    content: input.content,
    tags: input.tags ?? [],
    post_type: input.postType,
    event: input.event ?? null,
    media_urls: input.mediaUrls ?? [],
    brain_id: input.brainId ?? null,
    created_at: new Date(input.createdAt ?? Date.now()).toISOString(),
  };

  try {
    await supabase.insert("posts", row);
    res.status(201).json({
      post: {
        id: row.id,
        userId: row.user_id,
        topicId: row.topic_id,
        content: row.content,
        tags: row.tags,
        postType: row.post_type,
        event: row.event,
        mediaUrls: row.media_urls,
        brainId: row.brain_id,
        // Do not expose vote counts, even placeholder zeros; match feed privacy.
        reactions: { repost: 0 },
        commentCount: 0,
        repostCount: 0,
        createdAt: new Date(row.created_at).getTime(),
      },
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      // A 409 does not prove the existing row belongs to this caller or
      // matches this request. Never acknowledge an unverified write as saved.
      // Safe idempotent retries require a separately verified atomic design.
      if (error.status === 409) {
        res.status(409).json({ error: "Post conflict could not be verified" });
        return;
      }
      res.status(502).json({ error: "Could not create post" });
      return;
    }
    throw error;
  }
});

/**
 * Legacy writer is intentionally unavailable: it cannot establish mapped
 * identity, enforce recent sign-in, handle idempotent retries or hide counts.
 * No client header or feature flag can enable it. This API gate does not
 * prevent direct database or privileged-function writes.
 */
router.post("/posts/:id/react", requireAuth, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json({ error: "Voting temporarily unavailable" });
});

/** Unmounted legacy implementation retained solely for synthetic regression
 * tests and migration analysis. Never mount in a live router. */
export const legacyReactionHandlerForTests: RequestHandler = async (req, res) => {
  const parsed = ReactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reaction" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Reaction storage is not configured" });
    return;
  }

  const postId = String(req.params.id ?? "");
  // Strict slug/UUID validation — prevents PostgREST filter-injection on eq.<id>.
  if (!/^[A-Za-z0-9_-]+$/.test(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }
  const userId = req.auth!.uid;
  const { reactionType } = parsed.data;

  try {
    // Fetch the post to ensure it exists.
    const post = await supabase.getOne<{ id: string }>("posts", {
      filters: { id: `eq.${postId}` },
    });
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    // Fetch this user's current votes on the post.
    const existing = await supabase.get<{ id: string; reaction_type: string }>(
      "reactions",
      {
        filters: {
          target_type: "eq.post",
          target_id: `eq.${postId}`,
          user_id: `eq.${userId}`,
        },
      },
    );

    const currentRepost = existing.find((r) => r.reaction_type === "repost");

    if (reactionType === "repost") {
      if (currentRepost) {
        await supabase.delete("reactions", { id: currentRepost.id });
      } else {
        await supabase.insert("reactions", {
          target_type: "post",
          target_id: postId,
          user_id: userId,
          reaction_type: "repost",
        });
      }
    } else {
      // Remove each existing vote at most once, even if legacy data contains
      // both directions. The active direction toggles off; otherwise switch.
      const votes = existing.filter((r) => r.reaction_type === "upvote" || r.reaction_type === "downvote");
      const isActive = votes.some((r) => r.reaction_type === reactionType);
      for (const vote of votes) {
        await supabase.delete("reactions", { id: vote.id });
      }
      if (!isActive) {
        await supabase.insert("reactions", {
          target_type: "post",
          target_id: postId,
          user_id: userId,
          reaction_type: reactionType,
        });
      }
    }

    // Return fresh counts.
    const all = await supabase.get<{ reaction_type: string }>("reactions", {
      filters: { target_type: "eq.post", target_id: `eq.${postId}` },
    });
    const counts = {
      upvote: all.filter((r) => r.reaction_type === "upvote").length,
      downvote: all.filter((r) => r.reaction_type === "downvote").length,
      repost: all.filter((r) => r.reaction_type === "repost").length,
    };

    res.json({ postId, reactions: counts });
  } catch (error) {
    if (error instanceof SupabaseError) {
      res.status(502).json({ error: "Could not record reaction" });
      return;
    }
    throw error;
  }
};

export default router;
