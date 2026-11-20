import { useState, useEffect, useCallback } from "react";
import { Story } from "@/lib/types";
import { idb } from "@/lib/db";

export function useStories() {
  const [stories, setStories] = useState<Story[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const allStories = await idb.getAll<Story>("stories");
        if (cancelled) return;
        const now = Date.now();
        const activeStories = allStories.filter(s => s.expiresAt > now);
        activeStories.sort((a, b) => {
          if (a.isViewed === b.isViewed) {
            return b.createdAt - a.createdAt;
          }
          return a.isViewed ? 1 : -1;
        });
        if (!cancelled) setStories(activeStories);
      } catch (e) {
        console.error("Failed to load stories", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  // Keep a loadStories function for addStory + refresh (external callers).
  const loadStories = async () => {
    try {
      const allStories = await idb.getAll<Story>("stories");
      const now = Date.now();
      const activeStories = allStories.filter(s => s.expiresAt > now);
      activeStories.sort((a, b) => {
        if (a.isViewed === b.isViewed) {
          return b.createdAt - a.createdAt;
        }
        return a.isViewed ? 1 : -1;
      });
      setStories(activeStories);
    } catch (e) {
      console.error("Failed to load stories", e);
    }
  };

  const addStory = async (storyInput: Omit<Story, "id" | "createdAt" | "expiresAt">) => {
    // Validate required fields — without this, a story with no userId
    // or authorName gets persisted and crashes the StoriesBar renderer
    // (which assumes every story has an authorName).
    if (!storyInput.userId) throw new Error("userId is required");
    if (!storyInput.authorName) throw new Error("authorName is required");
    if (!storyInput.type || (storyInput.type !== "note" && storyInput.type !== "media")) {
      throw new Error('type must be "note" or "media"');
    }
    const newStory: Story = {
      ...storyInput,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      isViewed: false
    };
    await idb.putStrict("stories", newStory);
    await loadStories();
  };

  const markAsViewed = useCallback(async (id: string) => {
    const story = await idb.get<Story>("stories", id);
    if (story) {
      await idb.put("stories", { ...story, isViewed: true });
      // Direct in-place state update WITHOUT re-sorting. The previous
      // version re-sorted the array which changed index positions and
      // caused the StoriesBar viewer to jump to a different user's story
      // when a story was marked as viewed mid-view (audit Task ID 3,
      // finding A.5). The thumbnail order will update naturally when
      // `orderedUserIds` recomputes from this updated `stories` array,
      // but the viewer's `userIdx` stays valid because the array
      // reference only changes at the updated element — the relative
      // order of the OTHER elements is preserved.
      setStories(prev => prev.map(s => s.id === id ? { ...s, isViewed: true } : s));
    }
  }, []);

  return {
    stories,
    isLoading,
    addStory,
    markAsViewed,
    refresh: loadStories
  };
}
