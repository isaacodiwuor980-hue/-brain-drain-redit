import type { Post } from "./types";

/** Display-only redaction. Existing cache is retained; this is not database access control. */
export function hideCachedVoteDetailsV1(posts: readonly Post[]): Post[] {
  return posts.map(post => {
    const { userReactions: _userReactions, upvotes: _upvotes, ...rest } = post;
    return { ...rest, reactions: { repost: post.reactions?.repost ?? 0 } } as Post;
  });
}
