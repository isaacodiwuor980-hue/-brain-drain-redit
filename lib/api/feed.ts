import type { Post } from "../types";
import { api, ApiError } from "../api-client";
import { isFeedCursor, type FeedCursor } from "../feed-cursor";

export interface FeedResponse {
  posts: CloudPost[];
  hasMore: boolean;
  source: string;
  nextCursor?: FeedCursor | null;
}

/**
 * Post shape returned by the cloud API. It is a strict superset of the local
 * Post fields so it can be cached in IndexedDB and rendered directly.
 */
export type CloudPost = Post & {
  authorName?: string;
  authorAvatar?: string | null;
  topicName?: string;
};

export interface FeedParams {
  mode?: "foryou" | "following";
  topic?: string | null;
  limit?: number;
  offset?: number;
  cursor?: FeedCursor | null;
  signal?: AbortSignal;
}

/**
 * Fetches a page of posts from the API. Throws ApiError on failure so the
 * caller can fall back to IndexedDB.
 *
 * postType is normalized server-side, but we re-normalize here as defense in
 * depth: any unknown/legacy value (e.g. "text") would render an empty body
 * in PostCard, which looks like a broken feed.
 */
const CLIENT_POST_TYPES = new Set(["post", "question", "answer", "note"]);
function normalizeFeedPosts<T extends { posts: { postType?: string }[] }>(response: T): T {
  for (const post of response.posts) {
    if (!CLIENT_POST_TYPES.has(post.postType ?? "")) {
      post.postType = "post";
    }
  }
  return response;
}

export async function fetchFeed(params: FeedParams = {}): Promise<FeedResponse> {
  const query = new URLSearchParams();
  if (params.mode) query.set("mode", params.mode);
  if (params.topic) query.set("topic", params.topic);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.offset && params.cursor) throw new Error("Cannot combine feed offset and cursor");
  if (params.offset) query.set("offset", String(params.offset));
  if (params.cursor) {
    if (!isFeedCursor(params.cursor)) throw new Error("Invalid feed cursor");
    query.set("cursorCreatedAt", params.cursor.createdAt);
    query.set("cursorId", params.cursor.id);
  }
  const qs = query.toString();
  const response = await api.get<FeedResponse>(`/api/feed${qs ? `?${qs}` : ""}`, {
    signal: params.signal,
    cache: "no-store",
    retries: 1,
  });
  if (!response || !Array.isArray(response.posts) || typeof response.hasMore !== "boolean" ||
      (response.hasMore && !isFeedCursor(response.nextCursor))) {
    throw new Error("Invalid feed pagination response");
  }
  return normalizeFeedPosts(response);
}

export interface CreatePostInput {
  id: string;
  topicId: string;
  content: string;
  tags?: string[];
  postType?: "post" | "question" | "answer" | "note";
  event?: Post["event"];
  mediaUrls?: string[];
  brainId?: string;
  createdAt?: number;
}

/** Shared by immediate create and offline replay to avoid dropping fields. */
export function toCreatePostInput(post: Post): CreatePostInput {
  return {
    id: post.id,
    topicId: post.topicId,
    content: post.content,
    tags: post.tags,
    postType: post.postType,
    event: post.event,
    mediaUrls: post.mediaUrls,
    brainId: post.brainId,
    createdAt: post.createdAt,
  };
}

/** Creates a post on the server. Requires a valid auth token. */
export async function createPost(
  input: CreatePostInput,
  authToken?: string | null,
): Promise<{ post: Post }> {
  return api.post<{ post: Post }>("/api/posts", input, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
  });
}

export interface ReactionResponse {
  postId: string;
  reactions: { upvote: number; downvote: number; repost: number };
}

/** Toggles a reaction on a post. Requires a valid auth token. */
export async function reactToPost(
  postId: string,
  reactionType: "upvote" | "downvote" | "repost",
  authToken?: string | null,
): Promise<ReactionResponse> {
  return api.post<ReactionResponse>(
    `/api/posts/${encodeURIComponent(postId)}/react`,
    { reactionType },
    {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    },
  );
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}
