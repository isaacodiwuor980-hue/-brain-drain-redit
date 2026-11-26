import type { Post } from "./types";

/** Ordering/filtering only: this does not establish visibility, moderation,
 * topic provenance, account ownership or offline safety of supplied posts. */
export function selectChronologicalHomePosts(posts: readonly Post[], topicId: string | null, postId: string | null, limit: number): Post[] {
  if (!Number.isSafeInteger(limit) || limit < 0) return [];
  return posts.filter(post => post && typeof post.id === "string" && post.id.length > 0 &&
    typeof post.createdAt === "number" && Number.isFinite(post.createdAt) &&
    (!postId || post.id === postId) && (!topicId || post.topicId === topicId))
    .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, limit);
}
