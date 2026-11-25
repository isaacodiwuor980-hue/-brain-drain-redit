import type { Comment } from "./types";

/** Display-only containment: no content is modified or deleted. This does not
 * establish database authorization, account ownership, or storage security.
 * An entire private/deleted thread and descendants of missing, ambiguous,
 * cross-post or cyclic parents remain hidden even from the author. */
export function visibleCommentsWhilePrivacyUnverified(comments: readonly Comment[]): Comment[] {
  const byId = new Map<string, Comment | null>();
  for (const comment of comments) {
    if (typeof comment.id !== "string" || !comment.id) continue;
    byId.set(comment.id, byId.has(comment.id) ? null : comment);
  }
  const allowed = new Map<string, boolean>();
  for (const comment of comments) {
    if (typeof comment.id !== "string" || !comment.id || allowed.has(comment.id)) continue;
    const path: string[] = [];
    const seen = new Set<string>();
    let current: Comment | null | undefined = comment;
    let safe = false;
    while (current) {
      const id = current.id;
      if (allowed.has(id)) { safe = allowed.get(id) === true; break; }
      if (seen.has(id) || byId.get(id) !== current || current.isConfidential || current.isDeleted) break;
      seen.add(id);
      path.push(id);
      if (current.parentId === null || current.parentId === undefined) { safe = true; break; }
      if (typeof current.parentId !== "string" || !current.parentId) break;
      const parent = byId.get(current.parentId);
      if (!parent || parent.postId !== current.postId) break;
      current = parent;
    }
    for (const id of path) allowed.set(id, safe);
    // A rejected current node (e.g. a duplicate or a private node) must not
    // become eligible when visited separately or referenced by another child.
    if (!safe && current) allowed.set(current.id, false);
  }
  return comments.filter(comment => allowed.get(comment.id) === true && byId.get(comment.id) === comment);
}
