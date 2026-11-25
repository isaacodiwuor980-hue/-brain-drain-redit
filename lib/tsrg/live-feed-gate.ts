import type { Post } from "../types";
import { orderFeed } from "./feed";

/** Hard gate for the current client integration; flags/status cannot establish
 * identity, authorization, candidate visibility, topic validity, or quality.
 * This chronological ordering is not itself a visibility or moderation filter.
 * Offline scoring prototypes remain available for synthetic evaluation only. */
export function orderLiveFeed(posts: readonly Post[], mode: "foryou" | "following", _status: boolean, now: number): Post[] {
  return orderFeed(posts, mode, false, now);
}
