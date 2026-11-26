import { Router, type IRouter } from "express";
import { z } from "zod";
import { supabase, SupabaseError } from "../lib/supabase";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { requireMappedIdentity } from "../middleware/identity-map";
import { requireServerFeature } from "../middleware/server-feature-flag";

const router: IRouter = Router();

const FeedQuerySchema = z.object({
  mode: z.enum(["foryou", "following"]).default("foryou"),
  // Strict slug format — alphanumeric + dash + underscore only.
  // Prevents PostgREST filter-injection (e.g. topic='; DROP TABLE posts; --)
  // which would otherwise 502 on the eq.<value> filter.
  topic: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9_-]+$/, "topic must be a slug")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

interface PostRow {
  id: string;
  user_id: string;
  topic_id: string;
  content: string;
  tags: string[] | null;
  post_type: string;
  event: unknown;
  media_urls: string[] | null;
  brain_id: string | null;
  repost_count: number;
  created_at: string;
  comment_count: number;
  topic: { name: string } | null;
  author: { display_name: string; avatar_url: string | null } | null;
}

/** Shared cache stores aggregate repost counts only, never voter identities. */
interface CachedFeed {
  posts: Array<Record<string, unknown>>;
  hasMore: boolean;
  repostsByPost: Record<string, number>;
  cachedAt: number;
}

/**
 * Normalize the DB post_type to the frontend PostType union
 * ("post" | "question" | "answer" | "note").
 *
 * The posts table has no CHECK constraint on post_type, so legacy/manual
 * rows can carry values like "text" — the frontend PostCard renders NO body
 * for unknown types, making those posts look empty. Unknown/missing values
 * fall back to "post" so every post always renders its content.
 */
const VALID_POST_TYPES = new Set(["post", "question", "answer", "note"]);
function normalizePostType(raw: string | null | undefined): "post" | "question" | "answer" | "note" {
  if (raw && VALID_POST_TYPES.has(raw)) return raw as "post" | "question" | "answer" | "note";
  return "post";
}

/** Attach repost totals without returning individual reactions.
 * Vote totals are deliberately not exposed; this does not restrict direct DB
 * access or other routes. Verify linked brains per response.
 * Until ownership mapping is proven, even an author's private brain is omitted.
 */
async function renderFeedPosts(entry: CachedFeed) {
  const ids = [...new Set(entry.posts.map(row => row.brainId).filter((id): id is string =>
    typeof id === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(id)))];
  const publicIds = new Set<string>();
  if (ids.length) {
    try {
      const rows = await supabase.get<{id: string; is_public: boolean}>("brains", {
        select: "id,is_public", filters: { id: `in.(${ids.map(id => `"${id}"`).join(",")})`, is_public: "eq.true" }, limit: ids.length,
      });
      for (const row of rows) if (row && row.is_public === true && ids.includes(row.id)) publicIds.add(row.id);
    } catch {
      // Missing metadata or an upstream failure means no links can be proven public.
    }
  }
  return entry.posts.map((row) => {
    return {
      ...row,
      brainId: typeof row.brainId === "string" && publicIds.has(row.brainId) ? row.brainId : null,
      reactions: {
        repost: ((row as { repostCount?: number }).repostCount ?? 0) + (entry.repostsByPost[(row as { id: string }).id] ?? 0),
      },
    };
  });
}

// Separate, default-off path: never switch the existing feed implicitly. The
// flag and verified mapping must be provisioned before this can be exercised.
// It deliberately does not use the shared feed cache.
router.get("/feed/following-v2", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); },
  requireServerFeature("following_feed_v2"), requireAuth, requireMappedIdentity, async (req, res) => {
    const parsed = FeedQuerySchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: "Invalid feed query" }); return; }
    try {
      const following = await supabase.get<{ following_id: string }>("follows", {
        select: "following_id", filters: { follower_id: `eq.${req.mappedUserId}` }, limit: 501,
      });
      // Do not silently return an incomplete graph; replace with a server-side
      // paginated join before raising this cap. Deployment must verify that the
      // PostgREST row limit is at least 501, or truncation remains possible.
      if (following.length > 500) { res.status(503).json({ error: "Following graph exceeds supported size" }); return; }
      const ids = following.map(row => row.following_id);
      if (ids.some(id => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
        res.status(502).json({ error: "Feed data source unavailable" }); return;
      }
      if (ids.length === 0) { res.json({ posts: [], hasMore: false, source: "following" }); return; }
      const { topic, limit, offset } = parsed.data;
      const page = await fetchFeedPage("following", topic, limit, offset, ids, false);
      res.json({ posts: await renderFeedPosts(page), hasMore: page.hasMore, source: "following" });
    } catch {
      // Do not return or log upstream payloads which may contain user data.
      res.status(502).json({ error: "Feed data source unavailable" });
    }
  });

router.get("/feed", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); }, optionalAuth, async (req, res) => {
  const parsed = FeedQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid feed query" });
    return;
  }
  const { mode, topic, limit, offset } = parsed.data;

  // The legacy follow graph stores text subjects while posts are UUID-owned.
  // No verified binding or graph provenance exists, so neither a guessed join
  // nor a shared cache is safe. Do not silently present an empty feed as valid.
  if (mode === "following") {
    res.status(503).json({ error: "Following feed is unavailable while account identity is being verified" });
    return;
  }

  if (!supabase.isConfigured()) {
    res.json({ posts: [], hasMore: false, source: "degraded" });
    return;
  }

  // Do not serve old post bodies after deletion or a visibility change. A
  // no-store header also prevents compliant intermediaries from caching them.

  try {
    const fresh = await fetchFeedPage(mode, topic, limit, offset);
    const posts = await renderFeedPosts(fresh);
    res.header("X-Feed-Cache", "MISS");
    res.json({ posts, hasMore: fresh.hasMore, source: mode });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Feed query failed");
      res.status(502).json({ error: "Feed data source unavailable" });
      return;
    }
    req.log?.error?.({}, "Feed query failed");
    res.status(502).json({ error: "Feed data source unavailable" });
  }
});

/**
 * Fetch one page of the feed from Supabase: posts (with topic + author
 * embedded), then repost-only counts for those posts. Returns a cache-shaped
 * entry with no voter identities. The response is not stored in a shared cache.
 */
async function fetchFeedPage(
  mode: string,
  topic: string | undefined,
  limit: number,
  offset: number,
  followeeIds: string[] | null = null,
  includeTags = true,
): Promise<CachedFeed> {
  const filters: Record<string, string> = {};
  if (topic) filters.topic_id = `eq.${topic}`;
  // B3: when rendering the Following feed, restrict to the caller's follow
  // graph (PostgREST in.() filter). null = no restriction (For You).
  if (followeeIds) {
    filters.user_id = `in.(${followeeIds.map((id) => `"${id}"`).join(",")})`;
  }

  // Return newest first; live TSRG ranking and behavioral personalization
  // remain disabled until their security and privacy gates are verified.
  const rows = await supabase.get<PostRow>("posts", {
    select: `
      id,user_id,topic_id,content,${includeTags ? "tags," : ""}post_type,event,media_urls,brain_id,
      repost_count,created_at,comment_count,
      topic:topics(name),
      author:profiles(display_name,avatar_url)
    `,
    filters,
    order: [{ column: "created_at", ascending: false }, { column: "id", ascending: true }],
    limit: limit + 1,
    offset,
  });

  const page = rows.slice(0, limit);
  const postIds = page.map((r) => r.id);
  // Database contents can be malformed or supplied by other writers. Never
  // interpolate unchecked values into a PostgREST in-list filter.
  if (postIds.some(id => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(id))) {
    throw new SupabaseError("Invalid feed data", 502);
  }

  const repostsByPost: Record<string, number> = {};
  if (postIds.length > 0) {
    const reposts = await supabase.get<{target_id: string; reaction_type: string}>("reactions", {
      select: "target_id,reaction_type",
      filters: {
        target_type: "eq.post",
        target_id: `in.(${postIds.map((id) => `"${id}"`).join(",")})`,
        reaction_type: "eq.repost",
      },
    });
    // Validate again even if a mock or upstream violates the requested filter.
    for (const row of reposts) {
      if (row.reaction_type === "repost" && postIds.includes(row.target_id)) {
        repostsByPost[row.target_id] = (repostsByPost[row.target_id] ?? 0) + 1;
      }
    }
  }

  return {
    posts: page.map((row) => ({
      id: row.id,
      userId: row.user_id,
      topicId: row.topic_id,
      content: row.content,
      tags: row.tags ?? [],
      postType: normalizePostType(row.post_type),
      event: row.event,
      mediaUrls: row.media_urls || [],
      brainId: row.brain_id,
      repostCount: row.repost_count,
      createdAt: new Date(row.created_at).getTime(),
      commentCount: row.comment_count || 0,
      authorName: row.author?.display_name || "Anonymous",
      authorAvatar: row.author?.avatar_url,
      topicName: row.topic?.name,
    })),
    hasMore: rows.length > limit,
    repostsByPost,
    cachedAt: Date.now(),
  };
}

export default router;
