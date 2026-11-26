import type { Post } from "./types";

/** Keep current cloud fields, including visibility redactions, when caching a voted post. */
export function reconcileCachedCloudPost(server: Post, local: Post | undefined): Post {
  if (local?.userReactions && Object.values(local.userReactions).some(arr => Array.isArray(arr) && arr.length > 0)) {
    return { ...server, userReactions: local.userReactions, isSolved: local.isSolved, solvedAt: local.solvedAt, solvedBranchId: local.solvedBranchId };
  }
  return server;
}
