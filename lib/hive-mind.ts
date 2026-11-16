/**
 * lib/hive-mind.ts — Hive-Mind Engine V2 (deterministic ranking + maintenance).
 *
 * RECONSTRUCTED from spec in scripts/feature-smoke-test.ts +
 * tool-results audit file. The original 359-line file was lost during
 * a stash/restore cycle. This implementation follows the audit's spec
 * exactly + applies the bug fixes the audit identified:
 *
 *   - runReactivation uses stable notification IDs (fixes B.4:
 *     notification accumulation)
 *
 * This module is pure-math + IDB. No AI, no network, no real-time.
 * Everything runs client-side on each comment render + on app boot.
 */
import type { Comment, Post, Notification } from "./types";
import { idb } from "./db";

// ── 1. DETERMINISTIC DECAY & REWARDS (THE GRAVITY FORMULA) ─────────

/**
 * Calculate the gravity-rank score for a single comment.
 *
 *   CommentRank = (UserTopicScore * 12 + NetVotes * 2 + SourceLinks * 25)
 *                 / ((DaysOld + 1) ^ 0.55)
 *
 * Where NetVotes = (upvotes - downvotes), clamped to >= 0 so a
 * heavily-downvoted comment can't score negative.
 *
 * This favours expert status and verified sources over recency.
 */
export function computeCommentRank(comment: Comment): number {
  const userTopicScore = comment.userTopicScore ?? 0;
  const upvotes = comment.upvotes ?? 0;
  const downvotes = comment.downvotes ?? 0;
  const netVotes = Math.max(0, upvotes - downvotes);
  const sourceLinks = comment.sourceLinks ?? 0;

  const daysOld = (Date.now() - comment.createdAt) / (1000 * 60 * 60 * 24);
  const decay = Math.pow(daysOld + 1, 0.55);

  const numerator = userTopicScore * 12 + netVotes * 2 + sourceLinks * 25;

  return numerator / decay;
}

/**
 * Rank an array of comments by gravity score (highest first).
 * Pure function — does not mutate the input.
 */
export function rankComments<T extends Comment>(comments: T[]): Array<T & { rankScore: number }> {
  return comments
    .map((c) => ({ ...c, rankScore: computeCommentRank(c) }))
    .sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));
}

// ── 2. SOURCE-LINK COUNTING ────────────────────────────────────────

/**
 * Count the number of hyperlinks in a comment body.
 * Only counts http(s) URLs — ftp://, mailto:, javascript: don't match.
 */
export function countSourceLinks(content: string): number {
  if (!content) return 0;
  const matches = content.match(/https?:\/\/[^\s<>"']+/gi);
  return matches ? matches.length : 0;
}

/**
 * Compute the reputation delta to award for source links in a comment.
 * Awards +1 reputation per source link, capped at 5 to prevent
 * link-spamming abuse.
 */
export function computeSourceLinkReputation(content: string): number {
  const count = countSourceLinks(content);
  return Math.min(5, count);
}

// ── 3. PERIODIC MAINTENANCE ────────────────────────────────────────
//
// 4 maintenance functions that run on app boot, each rate-limited by
// its own localStorage timestamp so they only run when due:
//   - runPruning: 14-day prune of zero-score comments with no replies
//   - runFossilization: 30-day fossilize top-3 per post with source links
//   - runForkCheck: fork a post into a "Volume 2" spinoff when it exceeds
//     500 root comments
//   - runReactivation: 90-day reactivation of stale fossilized comments

const PRUNING_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily check
const PRUNING_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const PRUNING_KEY = "hive-mind-last-pruning";

const FOSSILIZATION_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FOSSILIZATION_TOP_N = 3; // top 3 per stream
const FOSSILIZATION_REPUTATION_BOOST = 5;
const FOSSILIZATION_KEY = "hive-mind-last-fossilization";

const FORK_THRESHOLD = 500; // root comments in a single stream
const FORK_INTERVAL_MS = 60 * 60 * 1000; // hourly check
const FORK_KEY = "hive-mind-last-fork";

const REACTIVATION_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const REACTIVATION_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const REACTIVATION_KEY = "hive-mind-last-reactivation";

/**
 * Read a localStorage-backed last-run timestamp. Returns 0 if missing
 * or unparseable (which causes the function to run on next boot).
 */
function readLastRun(key: string): number {
  try {
    return parseInt(localStorage.getItem(key) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function writeLastRun(key: string, now: number): void {
  try {
    localStorage.setItem(key, String(now));
  } catch {
    // Best-effort — private mode.
  }
}

/**
 * runPruning — soft-delete comments that have:
 *   - An absolute score of 0 (no net votes, no source links, no topic score)
 *   - An absolute reply count of 0 (no children, including deleted children)
 *   - Been created more than 14 days ago
 *
 * Skips fossilized + already-deleted comments.
 * Runs on app boot if 24 hours have elapsed since the last pruning.
 */
export async function runPruning(): Promise<void> {
  const lastRun = readLastRun(PRUNING_KEY);
  if (Date.now() - lastRun < PRUNING_INTERVAL_MS) return;

  try {
    const allComments = await idb.getAll<Comment>("comments");

    // Build a set of all parentIds that have at least one reply
    // (including deleted children — over-retention is safer than
    // under-retention here).
    const parentIds = new Set<string>();
    for (const c of allComments) {
      if (c.parentId) parentIds.add(c.parentId);
    }

    for (const comment of allComments) {
      // Skip fossilized + already-deleted
      if (comment.isFossilized || comment.isDeleted) continue;

      // Skip comments younger than 14 days
      if (Date.now() - comment.createdAt < PRUNING_AGE_MS) continue;

      // Skip comments with score > 0
      const upvotes = comment.upvotes ?? 0;
      const downvotes = comment.downvotes ?? 0;
      const netVotes = upvotes - downvotes;
      const sourceLinks = comment.sourceLinks ?? 0;
      const userTopicScore = comment.userTopicScore ?? 0;
      const score = userTopicScore * 12 + netVotes * 2 + sourceLinks * 25;
      if (score > 0) continue;

      // Skip comments that have any replies
      if (parentIds.has(comment.id)) continue;

      // Prune (soft-delete)
      await idb.put("comments", { ...comment, isDeleted: true });
    }

    writeLastRun(PRUNING_KEY, Date.now());
  } catch (err) {
    console.error("Pruning run failed:", err);
  }
}

/**
 * runFossilization — fossilize the top 3 highest-ranking comments per
 * post that have at least 1 source link.
 *
 * (The 4-river "per stream" split is gone — rivers were removed in
 * favor of reader House/Mouth votes, so fossilization now treats each
 * post's thread as one pool.)
 *
 * Fossilized comments:
 *   - Get `isFossilized: true` set in IDB
 *   - Become immutable (edit/delete hidden in the UI)
 *   - Render with a gold-bordered "Verified Community Wiki" appearance
 *   - Award the author +5 reputation
 *
 * Runs on app boot if 30 days have elapsed since the last fossilization.
 */
export async function runFossilization(): Promise<void> {
  const lastRun = readLastRun(FOSSILIZATION_KEY);
  if (Date.now() - lastRun < FOSSILIZATION_INTERVAL_MS) return;

  try {
    const allComments = await idb.getAll<Comment>("comments");

    // Group the fossilization candidates by post: have source links,
    // aren't already fossilized, aren't deleted.
    const candidatesByPost = new Map<string, Comment[]>();
    for (const c of allComments) {
      if ((c.sourceLinks ?? 0) === 0 || c.isFossilized || c.isDeleted) continue;
      const bucket = candidatesByPost.get(c.postId);
      if (bucket) bucket.push(c);
      else candidatesByPost.set(c.postId, [c]);
    }

    // Rank each post's candidates + take top 3.
    for (const candidates of candidatesByPost.values()) {
      const ranked = rankComments(candidates).slice(0, FOSSILIZATION_TOP_N);

      // Fossilize each + award the author +5 reputation.
      for (const comment of ranked) {
        await idb.put("comments", {
          ...comment,
          isFossilized: true,
          rankScore: comment.rankScore,
        });

        // Award +5 reputation to the comment's author (best-effort).
        try {
          const rep = await idb.get<{ id: string; xp: number }>("reputation", "me");
          if (rep) {
            await idb.put("reputation", {
              ...rep,
              xp: rep.xp + FOSSILIZATION_REPUTATION_BOOST,
            });
          }
        } catch {
          // Best-effort — reputation update is non-critical.
        }
      }
    }

    writeLastRun(FOSSILIZATION_KEY, Date.now());
  } catch (err) {
    console.error("Fossilization run failed:", err);
  }
}

/**
 * runForkCheck — when a single post's debate stream exceeds 500 root
 * comments, create a "Volume 2" spinoff post so the debate can continue
 * fresh without an unbounded thread.
 *
 * Runs on app boot if 1 hour has elapsed since the last fork check.
 * Only creates Volume 2 (a debate hitting 1000+ comments won't spawn
 * Volume 3 — that's a future enhancement, not a bug).
 */
export async function runForkCheck(): Promise<void> {
  const lastRun = readLastRun(FORK_KEY);
  if (Date.now() - lastRun < FORK_INTERVAL_MS) return;

  try {
    const allComments = await idb.getAll<Comment>("comments");
    const allPosts = await idb.getAll<Post>("posts");

    // Group root comments by postId, count roots per post.
    const rootCounts = new Map<string, number>();
    for (const c of allComments) {
      if (c.parentId) continue; // root only
      rootCounts.set(c.postId, (rootCounts.get(c.postId) || 0) + 1);
    }

    for (const [postId, count] of rootCounts) {
      if (count < FORK_THRESHOLD) continue;

      // Check if Volume 2 already exists.
      const forkId = `${postId}-fork-vol2`;
      const existingFork = await idb.get<Post>("posts", forkId);
      if (existingFork) continue;

      const original = allPosts.find((p) => p.id === postId);
      if (!original) continue;

      // Create the Volume 2 spinoff post. The original post is left
      // untouched — readers continue in the fork; the original thread
      // stays preserved for reading.
      const fork: Post = {
        id: forkId,
        userId: original.userId,
        topicId: original.topicId,
        title: `${original.title || "Debate"} — Volume 2`,
        content: `This is a continuation of the original debate, which exceeded ${FORK_THRESHOLD} root comments. The original thread is preserved for reading; new arguments go here.`,
        postType: "post",
        reactions: { upvote: 0, downvote: 0, repost: 0 },
        commentCount: 0,
        createdAt: Date.now(),
      };
      await idb.put("posts", fork);
    }

    writeLastRun(FORK_KEY, Date.now());
  } catch (err) {
    console.error("Fork check run failed:", err);
  }
}

/**
 * runReactivation — every 90 days, surface "Hive Has Shifted"
 * notifications for posts that have stale source-linked comments.
 *
 * BUG FIX (audit B.4): uses stable notification IDs `reactivation-${postId}`
 * so repeated runs don't accumulate duplicate notifications.
 *
 * Runs on app boot if 90 days have elapsed since the last reactivation.
 */
export async function runReactivation(): Promise<void> {
  const lastRun = readLastRun(REACTIVATION_KEY);
  if (Date.now() - lastRun < REACTIVATION_INTERVAL_MS) return;

  try {
    const allComments = await idb.getAll<Comment>("comments");
    const allPosts = await idb.getAll<Post>("posts");

    // Find posts with at least one comment older than 90 days that has
    // source links (these are the "high-value stale" posts).
    const postsWithSources = new Set<string>();
    for (const c of allComments) {
      if ((c.sourceLinks ?? 0) === 0) continue;
      if (Date.now() - c.createdAt < REACTIVATION_AGE_MS) continue;
      postsWithSources.add(c.postId);
    }

    for (const postId of postsWithSources) {
      const post = allPosts.find((p) => p.id === postId);
      if (!post) continue;

      // Stable notification ID — check if already exists before inserting.
      const notificationId = `reactivation-${postId}`;
      const existing = await idb.get<Notification>("notifications", notificationId);
      if (existing) continue;

      const notification: Notification = {
        id: notificationId,
        type: "brain_run", // closest existing type — could add 'hive_reactivation' later
        actorName: "Hive-Mind",
        content: `The Hive has shifted — "${post.title || "a post you might care about"}" has new activity worth revisiting.`,
        postId,
        read: false,
        createdAt: Date.now(),
      };
      await idb.put("notifications", notification);
    }

    writeLastRun(REACTIVATION_KEY, Date.now());
  } catch (err) {
    console.error("Reactivation run failed:", err);
  }
}

/**
 * runHiveMindMaintenance — single entry point called from App.tsx on
 * boot. Runs all 4 maintenance functions in sequence. Each function
 * is rate-limited by its own localStorage timestamp so calling on
 * every boot is safe — only runs when due.
 *
 * Errors in any single function don't block the others.
 */
export async function runHiveMindMaintenance(): Promise<void> {
  try {
    await runPruning();
  } catch (err) {
    console.warn("runPruning failed:", err);
  }
  try {
    await runFossilization();
  } catch (err) {
    console.warn("runFossilization failed:", err);
  }
  try {
    await runForkCheck();
  } catch (err) {
    console.warn("runForkCheck failed:", err);
  }
  try {
    await runReactivation();
  } catch (err) {
    console.warn("runReactivation failed:", err);
  }
}
