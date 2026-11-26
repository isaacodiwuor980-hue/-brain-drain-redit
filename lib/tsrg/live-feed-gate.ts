import type { Post } from "../types";
import { selectChronologicalHomePosts } from "../home-feed-chronological";

/** Hard gate for the current client integration; flags/status cannot establish
 * identity, authorization, candidate visibility, topic validity, or quality.
 * This chronological ordering is not itself a visibility or moderation filter.
 * Offline scoring prototypes remain available for synthetic evaluation only. */
export function orderLiveFeed(posts: readonly Post[], _mode: "foryou" | "following", _status: boolean, _now: number): Post[] {
  return selectChronologicalHomePosts(posts, null, null, posts.length);
}
