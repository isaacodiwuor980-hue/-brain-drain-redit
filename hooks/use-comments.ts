import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { idb } from "@/lib/db";
import { trackEvent } from "@/lib/analytics";
import { Comment, Post } from "@/lib/types";
import { countSourceLinks, computeSourceLinkReputation } from "@/lib/hive-mind";
import { votingAvailable } from "@/lib/vote-availability";

const STORE = "comments";

const uuidv4 = () => {
  // Prefer the platform-provided UUID when available; fall back to a
  // Math.random-based v4 for very old browsers / non-secure contexts.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export interface CommentWithChildren extends Comment {
  children: CommentWithChildren[];
}

export function useComments(postId?: string) {
  const queryClient = useQueryClient();

  const { data: comments = [], isLoading: isLoadingComments } = useQuery({
    queryKey: [STORE, "post", postId],
    queryFn: () => idb.getAllByIndex<Comment>(STORE, "postId", postId as string),
    enabled: Boolean(postId),
  });

  const buildCommentTree = (sourceComments: Comment[]): CommentWithChildren[] => {
    const commentMap: Record<string, CommentWithChildren> = {};
    const roots: CommentWithChildren[] = [];

    sourceComments.forEach((comment) => {
      commentMap[comment.id] = { ...comment, children: [] };
    });

    sourceComments.forEach((comment) => {
      const node = commentMap[comment.id];
      if (comment.parentId && commentMap[comment.parentId]) {
        commentMap[comment.parentId].children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortNodes = (nodes: CommentWithChildren[]) => {
      // Pinned reply always floats to the top of its sibling list so the
      // "definitive" answer is the first thing readers see in long threads.
      nodes.sort((a, b) => {
        if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
        return b.createdAt - a.createdAt;
      });
      nodes.forEach((node) => sortNodes(node.children));
    };
    sortNodes(roots);

    return roots;
  };

  const { mutateAsync: addComment } = useMutation({
    // Optimistic UI: pre-write the new comment into the React Query cache so
    // it appears in the thread BEFORE the IDB write resolves.
    onMutate: async (variables: {
      postId: string;
      parentId: string | null;
      content: string;
      authorName: string;
      isConfidential?: boolean;
    }) => {
      const queryKey = [STORE, "post", variables.postId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Comment[]>(queryKey);
      const sourceLinks = countSourceLinks(variables.content);
      const optimisticComment: Comment = {
        id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        postId: variables.postId,
        parentId: variables.parentId,
        content: variables.content,
        authorName: variables.authorName,
        authorId: "me",
        reactions: {},
        createdAt: Date.now(),
        isConfidential: variables.isConfidential,
        isOptimistic: true,
        sourceLinks,
      };
      queryClient.setQueryData<Comment[]>(queryKey, (old = []) => [...old, optimisticComment]);
      return { previous, queryKey };
    },
    mutationFn: async ({
      postId: targetPostId,
      parentId,
      content,
      authorName,
      isConfidential = false,
    }: {
      postId: string;
      parentId: string | null;
      content: string;
      authorName: string;
      isConfidential?: boolean;
    }) => {
      const sourceLinks = countSourceLinks(content);
      const newComment: Comment = {
        id: uuidv4(),
        postId: targetPostId,
        parentId,
        content,
        authorName,
        authorId: "me",
        reactions: {},
        createdAt: Date.now(),
        isConfidential,
        sourceLinks,
      };
      await idb.put(STORE, newComment);

      // Increment the post's commentCount. This is a denormalized counter
      // — if it fails (rare IDB error), the comment is already persisted
      // so we must NOT let this failure trigger onError (which would
      // roll back the optimistic cache and hide the comment from the UI).
      // Wrap in its own try/catch so the mutation still succeeds (B.4 fix).
      try {
        const post = await idb.get<Post>("posts", targetPostId);
        if (post) {
          await idb.put("posts", {
            ...post,
            commentCount: (post.commentCount || 0) + 1,
          });
        }
      } catch {
        // Best-effort — the comment is already saved; the counter
        // will be reconciled on the next refetch.
      }

      // Award +1 reputation per source link.
      const repDelta = computeSourceLinkReputation(content);
      if (repDelta > 0) {
        try {
          const rep = await idb.get<{ id: string; xp: number; level: number; streak: number; lastActiveDate: string; totalMissionsCompleted: number; totalBrainsCreated: number; totalCheckIns: number; badges: string[] }>("reputation", "me");
          if (rep) {
            await idb.put("reputation", {
              ...rep,
              xp: rep.xp + repDelta,
            });
          }
        } catch {
          // Best-effort — reputation update is non-critical.
        }
      }

      await trackEvent("comment_created", {
        postId: targetPostId,
        isReply: Boolean(parentId),
        contentLength: content.length,
        isConfidential,
        sourceLinks,
      });

      return newComment;
    },
    onError: (_err, _variables, context) => {
      // Rollback the optimistic comment on error.
      if (context?.previous !== undefined && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [STORE, "post", variables.postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  /**
   * Vote on a comment (upvote / downvote / unvote). Reddit/Quora parity.
   *
   * Behavior (matching Reddit):
   *  - If the user hasn't voted, clicking "up" sets myVote="up" and upvotes++.
   *  - If the user already upvoted, clicking "up" again REMOVES the vote (toggle off).
   *  - If the user already downvoted, clicking "up" switches to upvote
   *    (downvotes--, upvotes++).
   *  - Same logic for "down" (mirrored).
   *
   * The `myVote` field on the comment tracks the current viewer's vote
   * so the UI can show the active state. In a multi-user deployment this
   * would be a per-user map; in this local-first build it's a single
   * field (the "me" user).
   */
  const { mutateAsync: voteCommentMutation } = useMutation({
    onMutate: async ({ id, direction, postId: targetPostId }) => {
      // Optimistic UI — update the cache instantly so the user sees
      // their vote register with zero latency. If the mutation fails,
      // onMutate's snapshot is restored. This matches Reddit's vote
      // feel (instant response, no flash).
      const queryKey = [STORE, "post", targetPostId] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Comment[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<Comment[]>(queryKey, (old = []) =>
          old.map((c) => {
            if (c.id !== id) return c;
            const currentVote = c.myVote ?? null;
            const upvotes = c.upvotes ?? 0;
            const downvotes = c.downvotes ?? 0;
            if (direction === "up") {
              if (currentVote === "up") return { ...c, upvotes: Math.max(0, upvotes - 1), myVote: null };
              if (currentVote === "down") return { ...c, downvotes: Math.max(0, downvotes - 1), upvotes: upvotes + 1, myVote: "up" as const };
              return { ...c, upvotes: upvotes + 1, myVote: "up" as const };
            } else {
              if (currentVote === "down") return { ...c, downvotes: Math.max(0, downvotes - 1), myVote: null };
              if (currentVote === "up") return { ...c, upvotes: Math.max(0, upvotes - 1), downvotes: downvotes + 1, myVote: "down" as const };
              return { ...c, downvotes: downvotes + 1, myVote: "down" as const };
            }
          }),
        );
      }
      return { previous, queryKey };
    },
    mutationFn: async ({ id, direction, postId: targetPostId }: { id: string; direction: "up" | "down"; postId: string }) => {
      const comment = await idb.get<Comment>(STORE, id);
      if (!comment) return;

      const currentVote = comment.myVote ?? null;
      const upvotes = comment.upvotes ?? 0;
      const downvotes = comment.downvotes ?? 0;

      let newUpvotes = upvotes;
      let newDownvotes = downvotes;
      let newMyVote: "up" | "down" | null;

      if (direction === "up") {
        if (currentVote === "up") {
          newUpvotes = Math.max(0, upvotes - 1);
          newMyVote = null;
        } else if (currentVote === "down") {
          newDownvotes = Math.max(0, downvotes - 1);
          newUpvotes = upvotes + 1;
          newMyVote = "up";
        } else {
          newUpvotes = upvotes + 1;
          newMyVote = "up";
        }
      } else {
        if (currentVote === "down") {
          newDownvotes = Math.max(0, downvotes - 1);
          newMyVote = null;
        } else if (currentVote === "up") {
          newUpvotes = Math.max(0, upvotes - 1);
          newDownvotes = downvotes + 1;
          newMyVote = "down";
        } else {
          newDownvotes = downvotes + 1;
          newMyVote = "down";
        }
      }

      await idb.put(STORE, {
        ...comment,
        upvotes: newUpvotes,
        downvotes: newDownvotes,
        myVote: newMyVote,
      });
      await trackEvent("comment_reaction", {
        postId: targetPostId,
        commentId: id,
        reactionType: direction,
        active: newMyVote !== null,
      });
    },
    onError: (_err, _vars, context) => {
      // Rollback on failure.
      if (context?.previous !== undefined && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [STORE, "post", variables.postId] });
    },
  });

  /**
   * Classification votes — replace the 4-river author self-selection with
   * reader votes. The community classifies each comment as either:
   *  - "house" → House view: institutional / verifiable evidence
   *              (facts, official sources, expert consensus)
   *  - "mouth" → Word of mouth: crowd sentiment / lived experience
   *
   * Mutually exclusive (voting one clears the other), toggle-off on
   * re-click, optimistic cache update (same instant feel as voteComment).
   */
  const { mutateAsync: voteClassification } = useMutation({
    onMutate: async ({ id, classification, postId: targetPostId }) => {
      const queryKey = [STORE, "post", targetPostId] as const;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Comment[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<Comment[]>(queryKey, (old = []) =>
          old.map((c) => {
            if (c.id !== id) return c;
            const isHouse = classification === "house";
            const active = isHouse ? (c.myHouseVote ?? false) : (c.myMouthVote ?? false);
            if (isHouse) {
              return {
                ...c,
                houseVotes: Math.max(0, (c.houseVotes ?? 0) + (active ? -1 : 1)),
                myHouseVote: !active,
                mouthVotes: !active && (c.myMouthVote ?? false) ? Math.max(0, (c.mouthVotes ?? 0) - 1) : (c.mouthVotes ?? 0),
                myMouthVote: !active ? false : c.myMouthVote,
              };
            }
            return {
              ...c,
              mouthVotes: Math.max(0, (c.mouthVotes ?? 0) + (active ? -1 : 1)),
              myMouthVote: !active,
              houseVotes: !active && (c.myHouseVote ?? false) ? Math.max(0, (c.houseVotes ?? 0) - 1) : (c.houseVotes ?? 0),
              myHouseVote: !active ? false : c.myHouseVote,
            };
          }),
        );
      }
      return { previous, queryKey };
    },
    mutationFn: async ({ id, classification, postId: targetPostId }: { id: string; classification: "house" | "mouth"; postId: string }) => {
      const comment = await idb.get<Comment>(STORE, id);
      if (!comment) return;
      const isHouse = classification === "house";
      const active = isHouse ? (comment.myHouseVote ?? false) : (comment.myMouthVote ?? false);
      const next: Comment = { ...comment };
      if (isHouse) {
        next.houseVotes = Math.max(0, (comment.houseVotes ?? 0) + (active ? -1 : 1));
        next.myHouseVote = !active;
        if (!active && (comment.myMouthVote ?? false)) {
          next.mouthVotes = Math.max(0, (comment.mouthVotes ?? 0) - 1);
          next.myMouthVote = false;
        }
      } else {
        next.mouthVotes = Math.max(0, (comment.mouthVotes ?? 0) + (active ? -1 : 1));
        next.myMouthVote = !active;
        if (!active && (comment.myHouseVote ?? false)) {
          next.houseVotes = Math.max(0, (comment.houseVotes ?? 0) - 1);
          next.myHouseVote = false;
        }
      }
      await idb.put(STORE, next);
      await trackEvent("comment_classified", { postId: targetPostId, commentId: id, classification, active: !active });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined && context.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [STORE, "post", variables.postId] });
    },
  });

  // The old local vote fields are neither account-scoped nor synchronized;
  // do not run optimistic mutations or analytics while voting is disabled.
  const voteComment = (args: { id: string; postId: string; direction: "up" | "down" }) =>
    votingAvailable() ? voteCommentMutation(args) : Promise.reject(new Error("Voting temporarily unavailable"));
  const voteHouse = (args: { id: string; postId: string }) =>
    votingAvailable() ? voteClassification({ ...args, classification: "house" as const }) : Promise.reject(new Error("Voting temporarily unavailable"));
  const voteMouth = (args: { id: string; postId: string }) =>
    votingAvailable() ? voteClassification({ ...args, classification: "mouth" as const }) : Promise.reject(new Error("Voting temporarily unavailable"));

  /**
   * Pin a single reply per thread — the post author anchors the "definitive"
   * answer that drives long-running engagement. Pinning a new reply in a
   * thread automatically un-pins any previously pinned sibling so each
   * thread has at most one pinned reply.
   */
  const { mutateAsync: pinReply } = useMutation({
    mutationFn: async ({ id, postId: targetPostId, parentId }: { id: string; postId: string; parentId: string | null }) => {
      // Un-pin any siblings under the same parent first.
      const siblings = await idb.getAllByIndex<Comment>(STORE, "postId", targetPostId);
      for (const sib of siblings) {
        if (sib.parentId === parentId && sib.isPinned && sib.id !== id) {
          await idb.put(STORE, { ...sib, isPinned: false });
        }
      }
      const target = await idb.get<Comment>(STORE, id);
      if (target) {
        await idb.put(STORE, { ...target, isPinned: !target.isPinned });
      }
      await trackEvent("comment_pinned", { postId: targetPostId, commentId: id, parentId });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [STORE, "post", variables.postId] });
    },
  });

  /**
   * Edit a reply authored by the current user. Fossilized comments are
   * immutable — the edit is rejected (the UI also hides the Edit button
   * for fossilized comments, but this is the data-layer guard).
   */
  const { mutateAsync: editComment } = useMutation({
    mutationFn: async ({ id, postId: targetPostId, content }: { id: string; postId: string; content: string }) => {
      const target = await idb.get<Comment>(STORE, id);
      if (!target) return;
      // Fossilized comments are immutable — the 30-day Consensus Summary
      // Block is locked down per the Hive-Mind spec.
      if (target.isFossilized) return;
      await idb.put(STORE, {
        ...target,
        content,
        editedAt: Date.now(),
      });
      await trackEvent("comment_edited", { postId: targetPostId, commentId: id });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [STORE, "post", variables.postId] });
    },
  });

  /**
   * Soft-delete a reply authored by the current user. Fossilized comments
   * are immutable and cannot be deleted. The reply is hidden from the
   * tree but kept in IDB so the author can restore it later.
   */
  const { mutateAsync: deleteComment } = useMutation({
    mutationFn: async ({ id, postId: targetPostId, restore = false }: { id: string; postId: string; restore?: boolean }) => {
      const target = await idb.get<Comment>(STORE, id);
      if (!target) return;
      // Fossilized comments are immutable — cannot be deleted.
      if (target.isFossilized) return;
      await idb.put(STORE, { ...target, isDeleted: !restore });
      await trackEvent("comment_deleted", { postId: targetPostId, commentId: id, restored: restore });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [STORE, "post", variables.postId] });
    },
  });

  /**
   * REMOVED with the river UI — comments are no longer grouped into
   * streams; classification now happens via reader votes (voteHouse /
   * voteMouth). Old records may still carry a `stream` property in
   * local data; it is ignored everywhere.
   */

  return {
    comments,
    isLoadingComments,
    buildCommentTree,
    addComment,
    voteComment,
    voteHouse,
    voteMouth,
    pinReply,
    editComment,
    deleteComment,
  };
}
