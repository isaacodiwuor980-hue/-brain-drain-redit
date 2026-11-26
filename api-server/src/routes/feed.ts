import { Router, type IRouter } from "express";
import { z } from "zod";
import { supabase, SupabaseError } from "../lib/supabase";
import { optionalAuth } from "../middleware/auth";

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
  post_type: string;
  event: unknown;
  media_urls: string[] | null;
  mind_id: string | null;
  repost_count: number;
  created_at: string;
  comment_count: number;
  topic: { name: string } | null;
  author: { display_name: string; avatar_url: string | null } | null;
}

interface ReactionRow {
  target_id: string;
  reaction_type: string;
  user_id: string;
}

/**
 * Cache entry for one feed page: base posts WITHOUT per-user reactions
 * (myReaction is computed per-request on top), the reactions index, and
 * freshness metadata. Module-level so both the request handler and the
 * SWR background refresher share the shape.
 */
interface CachedFeed {
  posts: Array<Record<string, unknown>>;
  hasMore: boolean;
  reactionsByPost: Record<string, Array<{ target_id: string; reaction_type: string; user_id: string }>>;
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

router.get("/feed", optionalAuth, async (req, res) => {
  const parsed = FeedQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid feed query" });
    return;
  }
  const { mode, topic, limit, offset } = parsed.data;
  const currentUserId = req.auth?.uid;

  // If Supabase is not configured, the API runs in degraded/local mode.
  if (!supabase.isConfigured()) {
    res.json({ posts: [], hasMore: false, source: "degraded" });
    return;
  }

  // B3 FOLLOWING FIX: "following" previously returned the exact same rows as
  // "foryou" (mode was never applied) — the tab was a dead control. Resolve
  // the caller's follow graph from user_follows. Guests (and users whose
  // follows table isn't deployed yet) get an honest empty page, matching the
  // graceful 204 path in discover.ts POST /follow.
  let followeeIds: string[] | null = null;
  if (mode === "following") {
    if (!currentUserId) {
      res.json({ posts: [], hasMore: false, source: "following" });
      return;
    }
    try {
      const followRows = await supabase.get<{ followee_id: string }>("user_follows", {
        select: "followee_id",
        filters: { follower_id: `eq.${currentUserId}` },
        limit: 1000,
      });
      followeeIds = followRows.map((r) => r.followee_id);
    } catch (err) {
      // Distinguish "table not deployed" (graceful empty) from a real outage
      // (502) — same contract as discover.ts's follow insert.
      if (
        err instanceof SupabaseError &&
        (err.status === 404 || /PGRST205|Could not find/i.test(String(err.body ?? "")))
      ) {
        followeeIds = [];
      } else {
        throw err;
      }
    }
    if (followeeIds.length === 0) {
      res.json({ posts: [], hasMore: false, source: "following" });
      return;
    }
  }

  // In-memory cache for the feed. Keyed by (mode, topic, limit, offset).
  // Posts don't change frequently, so a 30-second TTL gives a good balance
  // between freshness and Supabase round-trip cost (each uncached call is
  // ~500-1000ms due to two REST queries; cached calls are <5ms).
  // The cache stores the base rows + reactions; per-user myReaction is
  // computed on top of the cached data, so it stays personalized.
  //
  // B-11 fix: the map is bounded with a simple LRU-eviction policy
  // (oldest entry dropped when capacity exceeded). Without this, an attacker
  // could exhaust memory by varying the offset parameter across requests.
  const FEED_CACHE_TTL_MS = 30_000; // 30 seconds — considered "fresh"
  // PERF (stale-while-revalidate): entries up to this age are served
  // INSTANTLY while a background refresh updates the cache for the next
  // request. Measured cold-cache latency: 514-948ms (two sequential
  // Supabase round trips); HIT: ~1ms. With SWR, only ONE visitor per
  // refresh window pays the cold cost — everyone else gets ~1ms. Feed data
  // being ≤ FEED_CACHE_STALE_MAX_MS old is an acceptable trade-off for a
  // social feed (reactions update client-side optimistically anyway).
  const FEED_CACHE_STALE_MAX_MS = 5 * 60_000; // 5 minutes
  const FEED_CACHE_MAX_ENTRIES = 128; // bounded LRU capacity
  type FeedCacheMap = Map<string, CachedFeed>;
  const feedCache: FeedCacheMap =
    (router as unknown as { __feedCache?: FeedCacheMap }).__feedCache ?? new Map<string, CachedFeed>();
  (router as unknown as { __feedCache?: FeedCacheMap }).__feedCache = feedCache;

  // LRU touch: re-insert moves the entry to the end (newest position).
  // Map iteration order is insertion order, so the first entry is the oldest.
  function feedCacheTouch(map: FeedCacheMap, key: string, value: CachedFeed) {
    if (map.has(key)) map.delete(key);
    map.set(key, value);
    while (map.size > FEED_CACHE_MAX_ENTRIES) {
      const oldestKey = map.keys().next().value;
      if (oldestKey === undefined) break;
      map.delete(oldestKey);
    }
  }

  const cacheKey = `${mode}:${topic || ""}:${limit}:${offset}`;
  const cached = feedCache.get(cacheKey);
  const cacheAge = cached ? Date.now() - cached.cachedAt : Infinity;

  // Background refresh dedup: only ONE in-flight refresh per cacheKey,
  // shared across requests (module-level on the router like the cache).
  type InflightSet = Set<string>;
  const refreshInFlight: InflightSet =
    (router as unknown as { __feedRefreshInFlight?: InflightSet }).__feedRefreshInFlight ?? new Set<string>();
  (router as unknown as { __feedRefreshInFlight?: InflightSet }).__feedRefreshInFlight = refreshInFlight;

  /** Fire-and-forget background refresh of one cache entry (SWR path). */
  function triggerBackgroundRefresh(key: string, refreshMode: string, refreshTopic: string | undefined, refreshLimit: number, refreshOffset: number, log: { warn?: (o: unknown, m: string) => void } | undefined) {
    if (refreshInFlight.has(key)) return; // dedupe
    refreshInFlight.add(key);
    void (async () => {
      const fresh = await fetchFeedPage(refreshMode, refreshTopic, refreshLimit, refreshOffset);
      feedCacheTouch(feedCache, key, fresh);
    })()
      .catch((err) => {
        // Stale data stays served on refresh failure — log and move on.
        log?.warn?.({ err }, "Feed background refresh failed — serving stale");
      })
      .finally(() => {
        refreshInFlight.delete(key);
      });
  }

  /** Render a per-user response from a cached feed entry (HIT + STALE paths). */
  function renderFromCache(entry: CachedFeed, header: "HIT" | "STALE") {
    const posts = entry.posts.map((row) => {
      const postReactions = entry.reactionsByPost[(row as { id: string }).id] || [];
      const upvotes = postReactions.filter((r) => r.reaction_type === "upvote").length;
      const downvotes = postReactions.filter((r) => r.reaction_type === "downvote").length;
      const reposts = postReactions.filter((r) => r.reaction_type === "repost").length;
      const myReaction = currentUserId
        ? postReactions.find((r) => r.user_id === currentUserId)?.reaction_type
        : undefined;
      // B-2 fix: cached rows store repostCount (camelCase, see cache fill
      // below). Parentheses + the correct property name fix both the
      // precedence bug and the snake_case lookup bug.
      const baseRepostCount = (row as { repostCount?: number }).repostCount ?? 0;
      return {
        ...(row as object),
        reactions: {
          upvote: upvotes,
          downvote: downvotes,
          repost: baseRepostCount + reposts,
        },
        userReactions:
          myReaction && currentUserId
            ? { [myReaction]: [currentUserId] }
            : undefined,
      };
    });
    res.set("X-Feed-Cache", header);
    res.json({
      posts,
      hasMore: entry.hasMore,
      source: mode,
    });
  }

  try {
    // B3: per-user followee filtering can't use the shared cross-user cache
    // (keyed only by mode/topic/limit/offset) — following pages fetch live.
    if (mode !== "following" && cached && cacheAge < FEED_CACHE_TTL_MS) {
      renderFromCache(cached, "HIT");
      return;
    }

    if (mode !== "following" && cached && cacheAge < FEED_CACHE_STALE_MAX_MS) {
      // PERF: stale-while-revalidate — serve instantly, refresh in background.
      renderFromCache(cached, "STALE");
      triggerBackgroundRefresh(cacheKey, mode, topic, limit, offset, req.log);
      return;
    }

    const filters: Record<string, string> = {};
    if (topic) filters.topic_id = `eq.${topic}`;

    // Live path (cold cache): fetch posts + reactions, fill the cache,
    // respond. Shared logic lives in fetchFeedPage so the SWR background
    // refresher uses the exact same code.
    const fresh = await fetchFeedPage(mode, topic, limit, offset, followeeIds);
    feedCacheTouch(feedCache, cacheKey, fresh);

    // Per-user rendering identical to renderFromCache, but here we have the
    // live rows (with currentUserId reactions applied the same way).
    const posts = fresh.posts.map((row) => {
      const postReactions = fresh.reactionsByPost[(row as { id: string }).id] || [];
      const upvotes = postReactions.filter((r) => r.reaction_type === "upvote").length;
      const downvotes = postReactions.filter((r) => r.reaction_type === "downvote").length;
      const reposts = postReactions.filter((r) => r.reaction_type === "repost").length;
      const myReaction = currentUserId
        ? postReactions.find((r) => r.user_id === currentUserId)?.reaction_type
        : undefined;

      return {
        ...(row as object),
        reactions: {
          upvote: upvotes,
          downvote: downvotes,
          repost: ((row as { repostCount?: number }).repostCount ?? 0) + reposts,
        },
        userReactions:
          myReaction && currentUserId
            ? { [myReaction]: [currentUserId] }
            : undefined,
      };
    });

    res.set("X-Feed-Cache", "MISS");
    res.json({
      posts,
      hasMore: fresh.hasMore,
      source: mode,
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ err: error, status: error.status }, "Feed query failed");
      res.status(502).json({ error: "Feed data source unavailable" });
      return;
    }
    throw error;
  }
});

/**
 * Fetch one page of the feed from Supabase: posts (with topic + author
 * embedded), then reactions for those posts. Returns the cache-shaped
 * entry (base posts WITHOUT per-user reactions + reactionsByPost index +
 * hasMore + cachedAt). Used by both the live request path and the
 * stale-while-revalidate background refresher.
 */
async function fetchFeedPage(
  mode: string,
  topic: string | undefined,
  limit: number,
  offset: number,
  followeeIds: string[] | null = null,
): Promise<CachedFeed> {
  const filters: Record<string, string> = {};
  if (topic) filters.topic_id = `eq.${topic}`;
  // B3: when rendering the Following feed, restrict to the caller's follow
  // graph (PostgREST in.() filter). null = no restriction (For You).
  if (followeeIds) {
    filters.user_id = `in.(${followeeIds.map((id) => `"${id}"`).join(",")})`;
  }

  // For you/following return newest first and let the client
  // apply local personalization signals.
  const rows = await supabase.get<PostRow>("posts", {
    select: `
      id,user_id,topic_id,content,post_type,event,media_urls,mind_id,
      repost_count,created_at,comment_count,
      topic:topics(name),
      author:profiles(display_name,avatar_url)
    `,
    filters,
    order: { column: "created_at", ascending: false },
    limit: limit + 1,
    offset,
  });

  const page = rows.slice(0, limit);
  const postIds = page.map((r) => r.id);

  let reactionsByPost: Record<string, ReactionRow[]> = {};
  if (postIds.length > 0) {
    const allReactions = await supabase.get<ReactionRow>("reactions", {
      filters: {
        target_type: "eq.post",
        target_id: `in.(${postIds.map((id) => `"${id}"`).join(",")})`,
      },
    });
    reactionsByPost = allReactions.reduce(
      (acc, r) => {
        (acc[r.target_id] ||= []).push(r);
        return acc;
      },
      {} as Record<string, ReactionRow[]>,
    );
  }

  return {
    posts: page.map((row) => ({
      id: row.id,
      userId: row.user_id,
      topicId: row.topic_id,
      content: row.content,
      postType: normalizePostType(row.post_type),
      event: row.event,
      mediaUrls: row.media_urls || [],
      mindId: row.mind_id,
      repostCount: row.repost_count,
      createdAt: new Date(row.created_at).getTime(),
      commentCount: row.comment_count || 0,
      authorName: row.author?.display_name || "Anonymous",
      authorAvatar: row.author?.avatar_url,
      topicName: row.topic?.name,
    })),
    hasMore: rows.length > limit,
    reactionsByPost: Object.fromEntries(
      Object.entries(reactionsByPost).map(([k, v]) => [k, v.map((r) => ({ target_id: r.target_id, reaction_type: r.reaction_type, user_id: r.user_id }))])
    ),
    cachedAt: Date.now(),
  };
}

export default router;
