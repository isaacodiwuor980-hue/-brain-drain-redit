import { Router, type IRouter, type RequestHandler } from "express";
import { supabase, SupabaseError } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * GET /api/discover/by-topics — Phase 3 (Topic Suggestions).
 * Returns up to 20 users who follow the same topics as the current user,
 * ranked by topic overlap count. Auth required.
 */
router.get("/discover/by-topics", requireAuth, async (req, res) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.json({ suggestions: [], source: "local-only" });
    return;
  }

  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const currentUserId = auth.uid;

  try {
    // Step 1: current user's followed topic_ids
    const myFollows = await supabase.get<{ topic_id: string }>("topic_followers", {
      select: "topic_id",
      filters: { user_id: `eq.${currentUserId}` },
      limit: 200,
    });
    if (myFollows.length === 0) {
      res.json({ suggestions: [], source: "no-topics" });
      return;
    }
    const topicIds = myFollows.map((f) => f.topic_id);

    // Step 2: other users following any of those topics
    const inFilter = `in.(${topicIds.map((id) => `"${id}"`).join(",")})`;
    const overlapRows = await supabase.get<{ user_id: string }>("topic_followers", {
      select: "user_id",
      filters: { topic_id: inFilter, user_id: `neq.${currentUserId}` },
      limit: 500,
    });

    // Step 3: aggregate by user → overlap count, top N
    const overlapMap = new Map<string, number>();
    for (const row of overlapRows) {
      overlapMap.set(row.user_id, (overlapMap.get(row.user_id) || 0) + 1);
    }
    const topUserIds = [...overlapMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([userId, overlap]) => ({ userId, overlap }));
    if (topUserIds.length === 0) {
      res.json({ suggestions: [], source: "no-overlap" });
      return;
    }

    // Step 4: profile details
    const userIdFilter = `in.(${topUserIds.map((u) => `"${u.userId}"`).join(",")})`;
    const profiles = await supabase.get<{
      id: string; username: string; display_name: string;
      avatar_url: string | null; follower_count: number;
    }>("profiles", {
      select: "id,username,display_name,avatar_url,follower_count",
      filters: { id: userIdFilter },
      limit,
    });

    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const suggestions = topUserIds
      .map(({ userId, overlap }) => {
        const profile = profileMap.get(userId);
        if (!profile) return null;
        return {
          id: profile.id,
          username: profile.username,
          displayName: profile.display_name || profile.username,
          avatarUrl: profile.avatar_url,
          followerCount: profile.follower_count,
          overlap,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    res.json({ suggestions, source: "supabase" });
  } catch (err) {
    logger.warn({ err }, "Topic-based discovery failed");
    res.json({ suggestions: [], source: "supabase-unavailable" });
  }
});

/**
 * GET /api/discover/follower-count — current user's follower count.
 * Used by the homepage to gate the PeopleYouMayKnow widget (<5 followers).
 */
router.get("/discover/follower-count", requireAuth, async (req, res) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.json({ followerCount: 0, source: "local-only" });
    return;
  }
  try {
    const rows = await supabase.get<{ follower_count: number }>("profiles", {
      select: "follower_count",
      filters: { id: `eq.${auth.uid}` },
      limit: 1,
    });
    res.json({ followerCount: rows[0]?.follower_count ?? 0, source: "supabase" });
  } catch (err) {
    logger.warn({ err }, "Follower count fetch failed");
    res.json({ followerCount: 0, source: "supabase-unavailable" });
  }
});

/**
 * POST /api/discover/follow — follow a user. Body: { userId }
 */
// Mounted route is fail-closed until follow identity and database permissions
// are verified end-to-end. Direct DB/privileged and old clients are unaffected.
router.post("/discover/follow", requireAuth, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json({ error: "Follow service unavailable" });
});

/** Historical implementation retained for audit; never mount as a route. */
export const legacyFollowHandlerForAudit: RequestHandler = async (req, res) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }
  const targetUserId = String(req.body?.userId ?? "");
  if (!/^[0-9a-fA-F-]{36}$/.test(targetUserId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  if (targetUserId === auth.uid) {
    res.status(400).json({ error: "Cannot follow yourself" });
    return;
  }
  try {
    // A missing table is an unavailable feature, not a successful follow.
    // Other storage errors propagate as retryable failures.
    try {
      await supabase.insert(
        "user_follows",
        { follower_id: auth.uid, followee_id: targetUserId, created_at: new Date().toISOString() },
        "resolution=merge-duplicates",
      );
    } catch (insertErr) {
      // Distinguish unavailable follow storage from a general upstream error.
      const isTableMissing =
        insertErr instanceof SupabaseError &&
        (insertErr.status === 404 || /PGRST205|Could not find/.test(String(insertErr.body || "")));
      if (isTableMissing) {
        logger.warn({}, "Follow storage unavailable");
        res.status(503).json({ error: "Follow service unavailable" });
        return;
      }
      throw insertErr;
    }
    res.status(204).end();
  } catch {
    // Upstream errors may contain account identifiers or request data.
    logger.warn({}, "Follow user failed");
    res.status(502).json({ error: "Could not follow user" });
  }
};

/**
 * GET /api/discover/search-users?q=... — Phase 4 (Username Search).
 * ilike substring match on profiles.username. Public. Requires 3+ chars.
 */
router.get("/discover/search-users", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 3) {
    res.status(400).json({ error: "Query must be at least 3 characters" });
    return;
  }
  if (q.length > 80) {
    res.status(400).json({ error: "Query too long" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.json({ results: [], source: "local-only" });
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  try {
    const likeFilter = `ilike.*${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}*`;
    const rows = await supabase.get<{
      id: string; username: string; display_name: string;
      avatar_url: string | null; follower_count: number;
    }>("profiles", {
      select: "id,username,display_name,avatar_url,follower_count",
      filters: { username: likeFilter },
      order: { column: "username", ascending: true },
      limit,
    });
    const results = rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name || row.username,
      avatarUrl: row.avatar_url,
      followerCount: row.follower_count,
    }));
    res.json({ results, count: results.length, source: "supabase" });
  } catch (err) {
    logger.warn({ err }, "User search failed");
    res.json({ results: [], count: 0, source: "supabase-unavailable" });
  }
});

/** Shared hash-matching logic for Phases 6 + 7 (phone + email contact sync). */
async function matchHashes(
  hashColumn: "phone_hash" | "email_hash",
  hashes: string[],
  excludeUserId: string,
): Promise<Array<{ id: string; username: string; display_name: string; avatar_url: string | null; follower_count: number }>> {
  const BATCH_SIZE = 500;
  const allMatches: Array<{
    id: string; username: string; display_name: string;
    avatar_url: string | null; follower_count: number;
  }> = [];
  for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
    const batch = hashes.slice(i, i + BATCH_SIZE);
    const inFilter = `in.(${batch.map((h) => `"${h}"`).join(",")})`;
    const rows = await supabase.get<{
      id: string; username: string; display_name: string;
      avatar_url: string | null; follower_count: number;
    }>("profiles", {
      select: "id,username,display_name,avatar_url,follower_count",
      filters: { [hashColumn]: inFilter },
      limit: BATCH_SIZE,
    });
    allMatches.push(...rows);
  }
  return allMatches.filter((m) => m.id !== excludeUserId);
}

function parseHashes(body: unknown): string[] {
  const hashes = Array.isArray((body as { hashes?: unknown })?.hashes)
    ? ((body as { hashes: unknown[] }).hashes as unknown[])
    : [];
  const validHash = /^[0-9a-f]{64}$/i;
  return hashes.filter((h): h is string => typeof h === "string" && validHash.test(h));
}

/**
 * POST /api/discover/by-contacts — Phase 6 (Phone Contact Sync).
 * Accepts SHA-256 phone hashes, matches against profiles.phone_hash.
 */
router.post("/discover/by-contacts", requireAuth, async (req, res) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.json({ matches: [], source: "local-only" });
    return;
  }
  const hashes = parseHashes(req.body);
  if (hashes.length === 0) {
    res.json({ matches: [], source: "no-input" });
    return;
  }
  if (hashes.length > 5000) {
    res.status(400).json({ error: "Too many hashes (max 5000)" });
    return;
  }
  try {
    const rows = await matchHashes("phone_hash", hashes, auth.uid);
    res.json({
      matches: rows.map((row) => ({
        id: row.id, username: row.username,
        displayName: row.display_name || row.username,
        avatarUrl: row.avatar_url, followerCount: row.follower_count,
      })),
      count: rows.length,
      source: "supabase",
    });
  } catch (err) {
    logger.warn({ err }, "Phone contact matching failed");
    res.json({ matches: [], count: 0, source: "supabase-unavailable" });
  }
});

/**
 * POST /api/discover/by-emails — Phase 7 (Google Email OAuth).
 * Accepts SHA-256 email hashes, matches against profiles.email_hash.
 */
router.post("/discover/by-emails", requireAuth, async (req, res) => {
  const auth = req.auth;
  if (!auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!supabase.isConfigured()) {
    res.json({ matches: [], source: "local-only" });
    return;
  }
  const hashes = parseHashes(req.body);
  if (hashes.length === 0) {
    res.json({ matches: [], source: "no-input" });
    return;
  }
  if (hashes.length > 5000) {
    res.status(400).json({ error: "Too many hashes (max 5000)" });
    return;
  }
  try {
    const rows = await matchHashes("email_hash", hashes, auth.uid);
    res.json({
      matches: rows.map((row) => ({
        id: row.id, username: row.username,
        displayName: row.display_name || row.username,
        avatarUrl: row.avatar_url, followerCount: row.follower_count,
      })),
      count: rows.length,
      source: "supabase",
    });
  } catch (err) {
    logger.warn({ err }, "Email contact matching failed");
    res.json({ matches: [], count: 0, source: "supabase-unavailable" });
  }
});

/**
 * POST /api/discover/set-contact-hash — REMOVED in Phase 3.
 *
 * The audit (NEEDS_MY_DECISION item 3a) flagged this as truly dead: no
 * frontend caller exists, so the write side of contact matching was never
 * invoked. The read sides (/by-contacts, /by-emails) still work — they
 * just return empty matches until a future task wires up contact-hash
 * storage on the client (e.g. during onboarding). Removing this endpoint
 * eliminates the false impression that contact matching is wired up.
 *
 * To restore: re-add this route, then add a client caller (likely in
 * hooks/use-contact-sync.ts or onboarding) that posts the user's hashed
 * phone/email after consent.
 */

export default router;
