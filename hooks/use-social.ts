import { useCallback, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { idb } from "../lib/db";
import { trackEvent } from "../lib/analytics";
import { Post } from "../lib/types";
import { togglePostReaction } from "../lib/post-votes";
import {
  createPost as createPostApi,
  fetchFeed,
  toCreatePostInput,
  reactToPost as reactToPostApi,
  isApiError,
} from "../lib/api/feed";
import { ApiError } from "../lib/api-client";
import { getAuthSession, getAuthToken } from "../lib/auth-token";
import { env } from "../lib/env";
import { queueOfflineAction } from "../lib/offline-sync";
import { orderLiveFeed } from "../lib/tsrg/live-feed-gate";
import { reconcileCachedCloudPost } from "../lib/feed-cache-reconcile";
import { useOnlineStatus } from "./use-online-status";
import { useToast } from "./use-toast";
import { mayStartVote } from "../lib/online-vote-policy";
import { votingAvailable } from "../lib/vote-availability";
import { hideCachedVoteDetailsV1 } from "../lib/vote-display-privacy";
import { maySendPostAs } from "../lib/post-owner-safety";

/** Posts fetched per page. Matches the server max (feed.ts limit.max = 50). */
const PAGE_SIZE = 30;

/**
 * One fetched feed page: the merged posts PLUS the server's hasMore cursor.
 * The cursor must live per-page so useInfiniteQuery knows whether a next
 * page exists (B4 pagination fix — the feed used to be hard-capped at one
 * 30-post page because offset/hasMore were never wired).
 */
interface FeedPage {
  posts: Post[];
  hasMore: boolean;
}

/**
 * Decide whether a feed-fetch error should be surfaced to the UI as a
 * "backend down" state. 401 is expected for guests (some routes require
 * auth) and must NOT surface as a feed failure; everything else (network
 * error, 500, timeout, Supabase 502) should surface so the user can
 * distinguish a genuinely empty feed from a fallback showing cached/seed
 * data.
 */
export function shouldSurfaceFeedError(error: unknown): boolean {
  // 401 (auth required) is expected for guests — not a feed failure.
  if (isApiError(error, 401)) return false;
  // B10: request aborts (React Query cancels in-flight fetches on key change
  // or unmount) are control flow, NOT backend failures — never surface them.
  // api-client converts aborts to ApiError("Request timed out or was aborted", 0).
  if (error instanceof ApiError && error.status === 0 && /abort/i.test(error.message)) {
    return false;
  }
  // Any other error (network, 5xx, timeout, Supabase error) surfaces.
  return true;
}

export function useSocial(mode: "foryou" | "following" = "foryou", topicId: string | null = null) {
  const queryClient = useQueryClient();
  const onlineStatus = useOnlineStatus();
  const { toast } = useToast();

  // Tracks whether the LAST cloud fetch failed with a non-auth error.
  // React Query's isError stays false because the query returns an empty page
  // on failure, so we surface the failure via
  // this ref + state pair instead. Reset to false on every new fetch.
  const feedFailedRef = useRef(false);
  const [feedFailed, setFeedFailed] = useState(false);

  const query = useInfiniteQuery<FeedPage>({
    queryKey: ["posts", mode, topicId],
    staleTime: 30_000,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const offset = pageParam as number;

      // Read local data only for non-destructive cache reconciliation, not display.
      const cached = (await idb.getAll<Post>("posts")).sort(
        (a, b) => b.createdAt - a.createdAt,
      );

      // apiEnabled: empty base URL means SAME-ORIGIN (production serves /api
      // from this host) — see lib/env.ts. Local-only builds set VITE_LOCAL_ONLY=1.
      if (!env.apiEnabled) {
        return { posts: [], hasMore: false };
      }

      // Reset failure flag at the start of each attempt.
      feedFailedRef.current = false;
      try {
        // B10: forward React Query's signal so switching modes/topics
        // cancels the in-flight request instead of racing it.
        const response = await fetchFeed({ mode, topic: topicId, limit: PAGE_SIZE, offset, signal });
        // Cloud fetch succeeded — clear any previously-surfaced failure.
        setFeedFailed(false);
        // Cache cloud posts locally for offline use. PREVIEW FIX: this write
        // is wrapped separately — a cache-write failure (quota, storage
        // blocked, private mode) must NEVER discard the cloud posts we just
        // fetched. Previously putAll threw inside the outer try and the
        // catch returned `cached` ([]) → blank feed in blocked-storage
        // contexts (sandboxed preview iframe / Safari ITP).
        if (response.posts.length > 0) {
          try {
            // GUEST VOTE FIX: don't clobber locally-voted posts on background
            // refetch. The server does not track guest reactions, so a blind
            // putAll would erase the user's upvote/downvote every time the
            // feed refetches (staleTime expiry, window focus, vote onSuccess).
            // Preserve local reactions, but always cache fresh server fields
            // such as a redacted brainId instead of retaining an old post.
            // This does not validate cached items missing from the response or
            // prevent stale data being displayed before a successful refresh.
            const localById = new Map(cached.map((p) => [p.id, p]));
            const toCache = response.posts.map((server) =>
              reconcileCachedCloudPost(server, localById.get(server.id)),
            );
            await idb.putAll("posts", toCache);
          } catch {
            console.warn("[feed] Could not cache posts locally (cloud data still shown)");
          }
        }
        if (mode === "following") {
          // B3: keep the Following tab honest — cloud results ONLY. The IDB
          // cache is the For-You universe (cold-start seeds, demo posts and
          // everything ever cached); merging it here would show content from
          // people the user does not follow.
          return { posts: hideCachedVoteDetailsV1(response.posts), hasMore: response.hasMore };
        }
        return { posts: hideCachedVoteDetailsV1(response.posts), hasMore: response.hasMore };
      } catch (error) {
        // Cached posts cannot establish current visibility or ownership.
        // Preserve them on device but do not render them as feed results.
        if (shouldSurfaceFeedError(error)) {
          feedFailedRef.current = true;
          setFeedFailed(true);
          console.warn("[feed] Cloud fetch failed; unverified cached posts are hidden.");
        }
        // B3: Following failures (including the signed-out empty page) stay
        // empty — never fall back to the For-You universe under this tab.
        if (mode === "following") return { posts: [], hasMore: false };
        return { posts: [], hasMore: false };
      }
    },
    // B4: cursor = next offset while the server says there is more.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length * PAGE_SIZE : undefined,
  });

  // Flatten fetched pages into a deduped list; offline visibility is unknown.
  const posts = useMemo(() => {
    const data = query.data;
    if (!data || onlineStatus === "offline") return [];
    const seen = new Set<string>();
    const out: Post[] = [];
    for (const page of data.pages) {
      for (const post of page.posts) {
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        out.push(post);
      }
    }
    // Shared local cache may contain another account's old selection and vote
    // totals. Hide those fields while the server-confirmed read is gated.
    return hideCachedVoteDetailsV1(orderLiveFeed(out, mode, false, query.dataUpdatedAt));
  }, [query.data, query.dataUpdatedAt, mode, onlineStatus]);

  const addPostMutation = useMutation({
    // Do not insert unverified local drafts into a shared feed cache.
    mutationFn: async (post: Post) => {
      // Persist the draft without exposing it as a verified feed item.
      await idb.putStrict("posts", post);
      await trackEvent("post_created", {
        postId: post.id,
        topicId: post.topicId,
        hasBrain: Boolean(post.brainId),
        hasEvent: Boolean(post.event),
        postType: post.postType || "post",
        mediaCount: post.mediaUrls?.length || 0,
        contentLength: post.content.length,
      });

      // Same-origin API when VITE_API_BASE_URL is empty — see lib/env.ts.
      if (!env.apiEnabled) return;

      const holdPostForReview = (ownerId: string) => {
        const queued = queueOfflineAction("create_post", { postId: post.id }, ownerId);
        if (!queued) {
          toast({ title: "Review storage unavailable", description: "The post remains on this device, but its review entry could not be saved. Do not clear browser data.", variant: "destructive" });
        }
      };
      const session = await getAuthSession();
      // Do not attribute a saved local draft to whichever account happens to
      // be active after the preceding asynchronous storage/analytics work.
      if (!session || session.uid !== post.userId || post.userId === "me" || post.userId.startsWith("guest-")) {
        toast({ title: "Post not published", description: "This item remains on this device and needs review.", variant: "destructive" });
        return;
      }
      // Media has no verified upload pipeline. Notes are not represented by
      // the mounted create API; never silently drop their attachments. Keep
      // the complete local draft and hold it for review instead of sending.
      if ((post.mediaUrls?.length ?? 0) > 0 || post.postType === "note" || (post.noteAttachments?.length ?? 0) > 0) {
        holdPostForReview(session.uid);
        toast({ title: "Post not published", description: "Image and note publishing is paused. This draft remains on this device and needs review.", variant: "destructive" });
        return;
      }
      // Offline posts are drafts for explicit review, not automatic sends.
      // Recheck navigator before sending too, since connectivity can change
      // while token acquisition is pending.
      if (!session.token || onlineStatus === "offline" || (typeof navigator !== "undefined" && navigator.onLine === false)) {
        holdPostForReview(session.uid);
        toast({ title: "Post not published", description: "This item remains on this device and needs review.", variant: "destructive" });
        return;
      }
      const active = await getAuthSession();
      if (!maySendPostAs(post.userId, active)) {
        toast({ title: "Post not published", description: "This item remains on this device and needs review.", variant: "destructive" });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        holdPostForReview(session.uid);
        toast({ title: "Post not published", description: "This item remains on this device and needs review.", variant: "destructive" });
        return;
      }
      try {
        await createPostApi(
          toCreatePostInput(post),
          active!.token,
        );
      } catch {
        // Keep the local copy for review; save status may be unknown.
        holdPostForReview(session.uid);
        console.warn("Post cloud status needs review.");
      }
    },
    onSuccess: () => {
      // Refetch in the background to reconcile with the server's view.
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const reactToPostMutation = useMutation({
    // APEX FIX (BUG #3): add onMutate for INSTANT optimistic UI feedback.
    // Previously the user clicked "upvote", saw NOTHING happen for ~200ms
    // (until mutationFn completed + onSuccess invalidated), then the count
    // updated. That's a "slow vote" feel. Now the cache updates synchronously
    // and the IDB write happens in the background.
    onMutate: async ({ postId, reactionType }) => {
      // The feed query keys are ["posts", mode, topicId] for every combo —
      // invalidate the partial ["posts"] prefix so all variants update.
      // GUARD: getQueriesData({queryKey:["posts"]}) is a PREFIX match, so it
      // ALSO returns any other ["posts", ...] query whose data is NOT an
      // InfiniteData (e.g. a single-post detail lookup). The setQueryData
      // updater below must skip those — calling old.pages.map on a non-infinite
      // shape throws "Cannot read properties of undefined (reading 'map')",
      // which aborts onMutate mid-flight so mutationFn never runs and the vote
      // silently never persists. This was the root cause of votes not working.
      const allPostQueries = queryClient.getQueriesData<InfiniteData<FeedPage>>({ queryKey: ["posts"] });
      const snapshots = allPostQueries.map(([key, data]) => ({ key, data }));

      // Cancel in-flight refetches so they don't clobber our optimistic update.
      await queryClient.cancelQueries({ queryKey: ["posts"] });

      // Optimistically apply the toggle to every cached INFINITE post list.
      // Non-infinite ["posts",...] queries (detail lookups etc.) are skipped:
      // their shape carries no `pages`, and toggling them needs a different
      // updater — touching them here would throw and abort the whole mutation.
      for (const [key] of allPostQueries) {
        queryClient.setQueryData<InfiniteData<FeedPage>>(key, (old) => {
          if (!old || !Array.isArray(old.pages)) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              posts: page.posts.map((p) =>
                p.id === postId ? togglePostReaction(p, reactionType).post : p,
              ),
            })),
          };
        });
      }
      return { snapshots };
    },
    mutationFn: async ({ postId, reactionType }: { postId: string; reactionType: string }) => {
      const post = await idb.get<Post>("posts", postId);
      if (!post) {
        // APEX-OMEGA R2: post not in IDB — throw a typed error so onError
        // knows to roll back the optimistic update. If we just `return`,
        // the cache shows voted but no local record exists → reload loses
        // the vote.
        const e = new Error("POST_NOT_FOUND");
        (e as unknown as { shouldRollback: boolean }).shouldRollback = true;
        throw e;
      }

      // Optimistic local toggle.
      const result = togglePostReaction(post, reactionType);

      try {
        await idb.putStrict("posts", result.post);
      } catch (idbErr) {
        // APEX-OMEGA R2: IDB write failed — local state is unknown. Tag
        // the error so onError rolls back. The UI must NOT show "voted"
        // when the persistence layer rejected the write.
        const e = new Error(`IDB_WRITE_FAILED: ${(idbErr as Error).message}`);
        (e as unknown as { shouldRollback: boolean }).shouldRollback = true;
        throw e;
      }

      // Vote is durably saved locally. Everything below is best-effort —
      // analytics failures and network failures must NOT roll back the
      // vote, because the user's intent IS persisted in IDB and will
      // sync later. We swallow these errors so onError never sees them.
      trackEvent("post_reaction", {
        postId,
        reactionType,
        active: result.active,
      }).catch(() => {
        // Analytics failure — silently ignore. The vote is saved.
      });

      // Same-origin API when VITE_API_BASE_URL is empty — see lib/env.ts.
      if (!env.apiEnabled) return;

      const session = await getAuthSession();
      const token = session?.token;
      // GUEST FIX: same contract as addPost — no session, no cloud write,
      // no offline-queue entry. The vote stays in IDB either way.
      if (!session) return;
      if (!token) {
        queueOfflineAction("post_reaction", { postId, reactionType }, session.uid);
        return;
      }
      try {
        if (reactionType === "upvote" || reactionType === "downvote" || reactionType === "repost") {
          const server = await reactToPostApi(postId, reactionType, token);
          // Reconcile local counts with server counts.
          const latest = await idb.get<Post>("posts", postId);
          if (latest) {
            await idb.put("posts", {
              ...latest,
              reactions: server.reactions,
              repostCount: server.reactions.repost,
            });
          }
        }
      } catch {
        // Server status is uncertain. Hold the local reaction for review.
        queueOfflineAction("post_reaction", { postId, reactionType }, session.uid);
        console.warn("Reaction status needs review.");
      }
    },
    // APEX-OMEGA R2: ALWAYS roll back when mutationFn throws. The only
    // errors that reach here are local failures (post not found, IDB write
    // failed) — both tagged with `shouldRollback`. Network/API errors are
    // caught inside mutationFn and queued for sync, so they never propagate.
    onError: (error, _vars, context) => {
      if (!(error as unknown as { shouldRollback?: boolean })?.shouldRollback) return;
      for (const { key, data } of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSuccess: async () => {
      // GUEST VOTE FIX: the server does not track guest votes. Invalidating
      // would refetch server data WITHOUT the user's reaction, and the
      // queryFn's putAll would overwrite the locally-voted post in IDB → the
      // vote vanishes within ~50ms of clicking. The optimistic update
      // (onMutate) + the idb.put in mutationFn are the source of truth for
      // guests. Only reconcile with the server for signed-in users, whose
      // votes are server-tracked (reactToPostApi returns the canonical counts).
      const token = await getAuthToken().catch(() => null);
      if (token) {
        void queryClient.invalidateQueries({ queryKey: ["posts"] });
      }
    },
  });

  // Stabilize reactToPost so memoized consumers (PostCard) don't re-render
  // on every useSocial re-render. The mutation's mutateAsync is itself
  // stable across renders, so the wrapper only needs to be memoized once.
  const reactToPost = useCallback(
    (postId: string, reactionType: string) => {
      if (!votingAvailable()) {
        toast({title:"Voting temporarily unavailable",description:"No vote or repost was sent.",variant:"destructive"});
        return Promise.resolve();
      }
      if (!mayStartVote(onlineStatus, typeof navigator === "undefined" || navigator.onLine !== false)) {
        toast({title:"Internet required",description:"Connect before voting or reposting.",variant:"destructive"});
        return Promise.resolve();
      }
      return reactToPostMutation.mutateAsync({ postId, reactionType });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutateAsync is referentially stable; the parent mutation object changes each render.
    [reactToPostMutation.mutateAsync, onlineStatus, toast],
  );

  return {
    posts,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    /** True when the last cloud fetch failed (non-auth). Posts may still be
     *  present from cache/seed — this flag lets the UI show a retry banner. */
    feedFailed,
    refetchFeed: query.refetch,
    addPost: addPostMutation.mutateAsync,
    reactToPost,
    refreshPosts: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
    // B4: real pagination surface for infinite scroll.
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
