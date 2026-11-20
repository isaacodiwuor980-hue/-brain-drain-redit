import type { Post } from "../types";
import { FIXED_SCALE, SENTINEL_INVALID, wilsonLowerBound } from "./index";

/** Opt-in experimental ordering of already-fetched posts only. Existing
 * reactions are unit-weight proxies, NOT stakes, expertise, or truth labels. */
export function rankExperimentalFeed(posts: readonly Post[], now: number): Post[] {
  const scored = posts.map((post, index) => {
    const up = post.reactions?.upvote ?? 0;
    const down = post.reactions?.downvote ?? 0;
    let score = SENTINEL_INVALID;
    if (Number.isFinite(now) && Number.isFinite(post.createdAt) && Number.isSafeInteger(up) && Number.isSafeInteger(down) && up >= 0 && down >= 0 && up + down <= 2_000_000) {
      const quality = wilsonLowerBound(BigInt(up) * FIXED_SCALE, BigInt(down) * FIXED_SCALE);
      const ageHours = Math.max(0, (now - post.createdAt) / 3_600_000);
      score = quality === SENTINEL_INVALID ? SENTINEL_INVALID : quality / Math.pow(ageHours + 2, 1.5);
    }
    return { post, score, index };
  });
  // Preserve every candidate, including malformed inputs and cold starts.
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map(({ post }) => post);
}

/** The existing chronological behavior remains the default and Following is unchanged. */
export function orderFeed(posts: readonly Post[], mode: "foryou" | "following", enabled: boolean, now: number): Post[] {
  const chronological = [...posts].sort((a, b) => b.createdAt - a.createdAt);
  return enabled && mode === "foryou" ? rankExperimentalFeed(chronological, now) : chronological;
}
