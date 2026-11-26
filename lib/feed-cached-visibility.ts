import type { Post } from "./types";
/** Display-only: cached links cannot prove current visibility; never erase stored drafts. */
export function hideUnverifiedCachedBrainLinks(posts: readonly Post[]): Post[] {
  return posts.map(post => post.brainId ? { ...post, brainId: undefined } : post);
}
