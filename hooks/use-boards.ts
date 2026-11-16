import { useState, useEffect, useCallback } from "react";
import { idb } from "@/lib/db";
import { Board } from "@/lib/types";

/**
 * useBoards — local-first boards (collections of pinned posts).
 *
 * PERF-001: previously imported the server barrel module (@/lib/<sdk>)
 * which eagerly pulled in the entire 885KB cloud SDK. That made every
 * PostCard on the home feed load it just for the bookmark feature. Now
 * uses IDB — the app is local-first and boards are a local concept. Zero
 * cloud SDK on the critical path.
 */
export function useBoards(userId: string | undefined) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setBoards([]);
      setIsLoading(false);
      return;
    }
    try {
      const all = await idb.getAllByIndex<Board>("boards", "ownerId", userId);
      setBoards(all.sort((a, b) => b.createdAt - a.createdAt));
    } catch (error) {
      console.error("Error fetching boards:", error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!userId) {
        if (isMounted) setIsLoading(false);
        return;
      }
      try {
        const all = await idb.getAllByIndex<Board>("boards", "ownerId", userId);
        if (!isMounted) return;
        setBoards(all.sort((a, b) => b.createdAt - a.createdAt));
      } catch (error) {
        console.error("Error fetching boards:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const createBoard = useCallback(
    async (name: string) => {
      if (!userId) return null;
      const newBoard: Board = {
        id: crypto.randomUUID(),
        ownerId: userId,
        name,
        createdAt: Date.now(),
      };
      await idb.put("boards", newBoard);
      setBoards((prev) => [newBoard, ...prev]);
      return newBoard.id;
    },
    [userId],
  );

  const addPin = useCallback(
    async (boardId: string, postId: string) => {
      if (!userId) return;
      await idb.put("pins", {
        id: crypto.randomUUID(),
        boardId,
        postId,
        ownerId: userId,
        createdAt: Date.now(),
      });
    },
    [userId],
  );

  return { boards, createBoard, addPin, isLoading, refresh };
}
