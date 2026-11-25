import type { Comment } from "./types";

/** Display-only containment while authorization and account-scoped offline
 * storage are unverified. Never deletes or changes saved comments; it is not a
 * server/database privacy boundary. Even the author cannot view them here. */
export function visibleCommentsWhilePrivacyUnverified(comments: readonly Comment[]): Comment[] {
  return comments.filter(comment => !comment.isConfidential);
}
