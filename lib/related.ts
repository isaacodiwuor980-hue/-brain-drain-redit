/**
 * lib/related.ts — tag-based related content discovery.
 *
 * Product spec: "Tags should suggest related content and Brains by default."
 * This utility finds brains and posts that share tags with the given item.
 * It's a simple set-intersection on the `tags` field — no AI, no external
 * services. Runs against local IDB so it's instant.
 */
import { idb } from "@/lib/db";
import { Brain, Post } from "@/lib/types";

/**
 * Returns brains that share at least one tag with the given tags.
 * Excludes the brain with the given ID (self-exclusion).
 * Returns at most `limit` results, sorted by the number of shared tags
 * (most relevant first).
 */
export async function getRelatedBrains(
  tags: string[],
  excludeBrainId?: string,
  limit = 5,
): Promise<Brain[]> {
  if (!tags || tags.length === 0) return [];
  const allBrains = await idb.getAll<Brain>("brains");
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  return allBrains
    .filter((b) => b.id !== excludeBrainId)
    .map((b) => ({
      brain: b,
      sharedCount: (b.tags || []).filter((t) => tagSet.has(t.toLowerCase())).length,
    }))
    .filter((x) => x.sharedCount > 0)
    .sort((a, b) => b.sharedCount - a.sharedCount)
    .slice(0, limit)
    .map((x) => x.brain);
}

/**
 * Returns posts that share at least one tag with the given tags.
 * Excludes the post with the given ID (self-exclusion).
 */
export async function getRelatedPosts(
  tags: string[],
  excludePostId?: string,
  limit = 5,
): Promise<Post[]> {
  if (!tags || tags.length === 0) return [];
  const allPosts = await idb.getAll<Post>("posts");
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  return allPosts
    .filter((p) => p.id !== excludePostId)
    .map((p) => ({
      post: p,
      sharedCount: (p.tags || []).filter((t) => tagSet.has(t.toLowerCase())).length,
    }))
    .filter((x) => x.sharedCount > 0)
    .sort((a, b) => b.sharedCount - a.sharedCount)
    .slice(0, limit)
    .map((x) => x.post);
}
