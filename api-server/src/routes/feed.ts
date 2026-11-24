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

/** Attach aggregate counts and only the requesting user's reaction types.
 * The cache is shared; verify linked brains on every response, not when cached.
 * Until ownership mapping is proven, even an author's private brain is omitted.
 */
async function renderFeedPosts(entry: CachedFeed, currentUserId: string | undefined) {
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
    const reactions = entry.reactionsByPost[(row as { id: string }).id] || [];
    const own: Record<string, string[]> = {};
    if (currentUserId) {
      for (const reaction of reactions) {
        if (reaction.user_id === currentUserId && ["upvote", "downvote", "repost"].includes(reaction.reaction_type)) {
          own[reaction.reaction_type] = [currentUserId];
        }
      }
    }
    return {
      ...row,
      brainId: typeof row.brainId === "string" && publicIds.has(row.brainId) ? row.brainId : null,
      reactions: {
        upvote: reactions.filter((r) => r.reaction_type === "upvote").length,
        downvote: reactions.filter((r) => r.reaction_type === "downvote").length,
        repost: ((row as { repostCount?: number }).repostCount ?? 0) + reactions.filter((r) => r.reaction_type === "repost").length,
      },
      userReactions: Object.keys(own).length ? own : undefined,
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
      res.json({ posts: await renderFeedPosts(page, req.mappedUserId), hasMore: page.hasMore, source: "following" });
    } catch {
      // Do not return or log upstream payloads which may contain user data.
      res.status(502).json({ error: "Feed data source unavailable" });
    }
  });

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
  // follows table isn't deployed yet) get an empty page. This legacy lookup
  // is not compatible with the inspected live schema; follow writes fail closed.
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
        req.log?.error?.({}, "Following feed lookup failed");
        res.status(502).json({ error: "Feed data source unavailable" });
        return;
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
      .catch(() => {
        // Stale data stays served on refresh failure — log and move on.
        log?.warn?.({}, "Feed background refresh failed — serving stale");
      })
      .finally(() => {
        refreshInFlight.delete(key);
      });
  }

  /** Render a per-user response from a cached feed entry (HIT + STALE paths). */
  async function renderFromCache(entry: CachedFeed, header: "HIT" | "STALE") {
    const posts = await renderFeedPosts(entry, currentUserId);
    // res.header (not res.set) so the value does not get appended to Vary,
    // which caused cache fragmentation for compressed responses.
    res.header("X-Feed-Cache", header);
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
      await renderFromCache(cached, "HIT");
      return;
    }

    if (mode !== "following" && cached && cacheAge < FEED_CACHE_STALE_MAX_MS) {
      // PERF: stale-while-revalidate — serve instantly, refresh in background.
      await renderFromCache(cached, "STALE");
      triggerBackgroundRefresh(cacheKey, mode, topic, limit, offset, req.log);
      return;
    }

    const filters: Record<string, string> = {};
    if (topic) filters.topic_id = `eq.${topic}`;

    // Live path (cold cache): fetch posts + reactions, fill the cache,
    // respond. Shared logic lives in fetchFeedPage so the SWR background
    // refresher uses the exact same code.
    const fresh = await fetchFeedPage(mode, topic, limit, offset, followeeIds);
    if (mode !== "following") feedCacheTouch(feedCache, cacheKey, fresh);

    // Per-user rendering identical to renderFromCache, but here we have the
    // live rows (with currentUserId reactions applied the same way).
    const posts = await renderFeedPosts(fresh, currentUserId);

    res.header("X-Feed-Cache", "MISS");
    res.json({
      posts,
      hasMore: fresh.hasMore,
      source: mode,
    });
  } catch (error) {
    if (error instanceof SupabaseError) {
      req.log?.error?.({ status: error.status }, "Feed query failed");
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
  includeTags = true,
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
      id,user_id,topic_id,content,${includeTags ? "tags," : ""}post_type,event,media_urls,brain_id,
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
  // Database contents can be malformed or supplied by other writers. Never
  // interpolate unchecked values into a PostgREST in-list filter.
  if (postIds.some(id => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(id))) {
    throw new SupabaseError("Invalid feed data", 502);
  }

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
    reactionsByPost: Object.fromEntries(
      Object.entries(reactionsByPost).map(([k, v]) => [k, v.map((r) => ({ target_id: r.target_id, reaction_type: r.reaction_type, user_id: r.user_id }))])
    ),
    cachedAt: Date.now(),
  };
}

export default router;
