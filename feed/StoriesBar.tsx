import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Story } from "@/lib/types";
import { useStories } from "@/hooks/use-stories";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/device";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Play, BrainCircuit, Film, ImageOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { resolveMediaUrl, findStoryVideo, findStoryImage, clampStoryVideoDuration } from "@/lib/media";
import { useAuth } from "@/components/auth/AuthContext";
import { RuntimeEngine } from "@/RuntimeEngine";
import { useDatabase } from "@/hooks/use-database";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * SmartMedia — resilient <img>/<video> used by the tray preview cards.
 *
 * Mobile autoplay fix (the "media fails / won't play on other phones" bug):
 * - The video element carries `muted` + `playsInline` + `loop` AND sets
 *   `el.muted = true` imperatively in the ref callback. React applies the
 *   `muted` prop as a DOM property, not an attribute — iOS Safari checks
 *   the ATTRIBUTE when deciding whether silent autoplay is allowed, so
 *   without the imperative set the preview silently refuses to play on
 *   iPhones (and Chrome Android in low-power mode).
 * - `onCanPlay` retries `.play()` and swallows the rejection: browsers in
 *   data-saver mode simply keep the poster/first frame instead of erroring.
 * - No `crossOrigin` on either tag — see lib/media.ts for why blanket
 *   crossOrigin would BREAK media from non-CORS hosts (the opposite of the
 *   fix we want). `referrerPolicy="no-referrer"` avoids hotlink-protection
 *   403s when the app runs inside the preview iframe.
 * - Any load failure falls back to a graceful gradient tile — never a
 *   broken-image icon on external mobile browsers.
 */
function SmartMedia({ src, alt, isVideo, poster, eager = false }: {
  src: string;
  alt: string;
  isVideo: boolean;
  poster?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-muted to-accent/40 text-muted-foreground">
        {isVideo ? <Film className="w-5 h-5" /> : <ImageOff className="w-5 h-5" />}
        <span className="text-[10px] font-medium px-2 text-center">Couldn't load media</span>
      </div>
    );
  }

  if (isVideo) {
    return (
      <video
        src={src}
        poster={poster}
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
        disablePictureInPicture
        aria-label={alt}
        className="w-full h-full object-cover"
        ref={(el) => { if (el) el.muted = true; }}
        onCanPlay={(e) => { e.currentTarget.play().catch(() => { /* autoplay blocked → poster frame is fine */ }); }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export function StoriesBar() {
  const { stories, isLoading, markAsViewed, addStory } = useStories();
  const { user } = useAuth();
  const { minds } = useDatabase();
  
  const [runningMindId, setRunningMindId] = useState<string | null>(null);
  
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [selectedMindId, setSelectedMindId] = useState<string>("none");

  const [viewerState, setViewerState] = useState<{ userIdx: number, storyIdx: number, key: number, isPaused: boolean } | null>(null);
  const [progress, setProgress] = useState(0);
  const pointerDownTime = useRef<number>(0);
  const STORY_DURATION = 5000;
  const UPDATE_INTERVAL = 50;
  // Video stories override the 5s default with their real (clamped)
  // duration — set via onLoadedMetadata in the viewer. Ref-mirrored so the
  // interval tick reads the live value without re-creating the timer.
  const storyDurationRef = useRef(STORY_DURATION);

  // APEX FIX (BUG #1 + #5): ref-mirror of `progress` so the interval effect
  // doesn't depend on `progress` and recreate the timer every ~50ms tick.
  // Without this, each tick tears down + recreates the interval = ~100 cycles
  // per 5s story = visible jank on mid-tier Android + GC pressure.
  const progressRef = useRef(0);
  useEffect(() => { progressRef.current = progress; }, [progress]);

  // APEX FIX (BUG #5): session-scoped Set of story IDs already marked viewed.
  // Prevents the markAsViewed effect from re-writing the same `isViewed: true`
  // row every time `groupedStories` re-derives a new object reference (which
  // happens on every stories refetch — every 10s by default = infinite writes).
  const viewedStoryIdsRef = useRef<Set<string>>(new Set());

  // Group stories by user and sort chronologically
  const groupedStories = useMemo(() => {
    const groups: Record<string, Story[]> = {};
    stories.forEach(story => {
      if (!groups[story.userId]) groups[story.userId] = [];
      groups[story.userId].push(story);
    });
    Object.keys(groups).forEach(uid => {
      groups[uid].sort((a, b) => a.createdAt - b.createdAt);
    });
    return groups;
  }, [stories]);

  // Sort users: Current user -> Unseen stories -> Newest seen stories
  const orderedUserIds = useMemo(() => {
    return Object.keys(groupedStories).sort((a, b) => {
      if (a === user?.id) return -1;
      if (b === user?.id) return 1;
      const aHasUnseen = groupedStories[a].some(s => !s.isViewed);
      const bHasUnseen = groupedStories[b].some(s => !s.isViewed);
      if (aHasUnseen && !bHasUnseen) return -1;
      if (!aHasUnseen && bHasUnseen) return 1;
      const aLatest = Math.max(...groupedStories[a].map(s => s.createdAt));
      const bLatest = Math.max(...groupedStories[b].map(s => s.createdAt));
      return bLatest - aLatest;
    });
  }, [groupedStories, user?.id]);

  const closeViewer = useCallback(() => {
    triggerHaptic("light");
    setViewerState(null);
    setRunningMindId(null);
    setProgress(0);
  }, []);

  const handleNext = useCallback(() => {
    triggerHaptic("selection");
    if (!viewerState) return;
    const { userIdx, storyIdx } = viewerState;
    const currentUserId = orderedUserIds[userIdx];
    const userStoryCount = groupedStories[currentUserId].length;
    
    if (storyIdx < userStoryCount - 1) {
      setViewerState({ userIdx, storyIdx: storyIdx + 1, key: Date.now(), isPaused: false });
    } else if (userIdx < orderedUserIds.length - 1) {
      setViewerState({ userIdx: userIdx + 1, storyIdx: 0, key: Date.now(), isPaused: false });
    } else {
      closeViewer();
    }
    setProgress(0);
  }, [viewerState, orderedUserIds, groupedStories, closeViewer]);

  const handlePrev = useCallback(() => {
    triggerHaptic("selection");
    if (!viewerState) return;
    const { userIdx, storyIdx } = viewerState;
    
    if (progress > 20) {
      setViewerState({ userIdx, storyIdx, key: Date.now(), isPaused: false });
      setProgress(0);
      return;
    }
    
    if (storyIdx > 0) {
      setViewerState({ userIdx, storyIdx: storyIdx - 1, key: Date.now(), isPaused: false });
    } else if (userIdx > 0) {
      const prevUserId = orderedUserIds[userIdx - 1];
      setViewerState({ userIdx: userIdx - 1, storyIdx: groupedStories[prevUserId].length - 1, key: Date.now(), isPaused: false });
    } else {
      setViewerState({ userIdx, storyIdx, key: Date.now(), isPaused: false });
    }
    setProgress(0);
  }, [viewerState, progress, orderedUserIds, groupedStories]);

  useEffect(() => {
    if (progress >= 100) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate state-machine transition: when the progress timer crosses 100, advance to the next story; refactoring to derived state would change behavior (handleNext has side effects + multi-state updates).
      handleNext();
    }
  }, [progress, handleNext]);

  // APEX FIX (BUG #1 + #6): interval is set up ONCE per viewer session.
  // - progress is read from ref (no recreation per tick)
  // - document.hidden is observed via visibilitychange so the timer pauses
  //   when the user switches tabs (battery-friendly, fixes BUG #6)
  // - pausing via runningMindId / isPaused / progress>=100 is handled by
  //   clearing the interval in those cases (still no per-tick recreation)
  //
  // APEX-OMEGA RESIDUE FIX (R1): the interval callback now NO-OPs when
  // progressRef.current >= 100. Previously, after the tick that brought
  // progress to 100, the OLD interval could fire ONE more time before the
  // effect cleanup ran (effects run after paint, not synchronously) —
  // progress would jump to 101, the progress>=100 effect would fire
  // handleNext() AGAIN, and the user would skip a story. The guard below
  // makes the tick idempotent: only ONE tick can cross the 100 threshold.
  useEffect(() => {
    if (!viewerState || runningMindId || viewerState.isPaused) return undefined;

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => {
        // APEX-OMEGA R1: don't advance past 100. handleNext() will fire
        // from the progress>=100 effect and recreate this interval with
        // a fresh viewerState.key. The old interval's cleanup will then
        // stop this timer. But in the gap between the 100-crossing tick
        // and the cleanup, the timer could fire again — this guard makes
        // that re-fire a no-op.
        if (progressRef.current >= 100) return;
        const next = Math.min(100, progressRef.current + (100 / (storyDurationRef.current / UPDATE_INTERVAL)));
        progressRef.current = next;
        setProgress(next);
      }, UPDATE_INTERVAL);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const handleVisibility = () => {
      if (document.hidden) stop(); else start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [viewerState, runningMindId, viewerState?.isPaused]);

  // Per-story duration reset: every navigation stamps a new viewerState.key.
  // Video stories override this via onLoadedMetadata; text/image stories
  // keep the 5s default.
  useEffect(() => {
    storyDurationRef.current = STORY_DURATION;
  }, [viewerState?.key]);

  // APEX FIX (BUG #5): markAsViewed is now called AT MOST ONCE per story id
  // per session. The viewedStoryIdsRef Set short-circuits redundant IDB
  // writes that previously fired every time `groupedStories` re-derived.
  useEffect(() => {
    if (viewerState) {
      const currentUserId = orderedUserIds[viewerState.userIdx];
      const currentStory = groupedStories[currentUserId]?.[viewerState.storyIdx];
      if (currentStory && !currentStory.isViewed && !viewedStoryIdsRef.current.has(currentStory.id)) {
        viewedStoryIdsRef.current.add(currentStory.id);
        markAsViewed(currentStory.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally scoped to the specific viewerState fields the effect reads (userIdx/storyIdx), not the whole object (which also carries key/isPaused and would cause spurious re-runs).
  }, [viewerState?.userIdx, viewerState?.storyIdx, orderedUserIds, groupedStories, markAsViewed]);

  const handleStoryClick = (uid: string) => {
    triggerHaptic("selection");
    const userIdx = orderedUserIds.indexOf(uid);
    if (userIdx !== -1) {
      const userSt = groupedStories[uid];
      let firstUnseenIdx = userSt.findIndex(s => !s.isViewed);
      if (firstUnseenIdx === -1) firstUnseenIdx = 0;
      // eslint-disable-next-line react-hooks/purity -- Date.now() inside an event handler (handleStoryClick) to stamp a fresh viewerState.key per open; fires only on click, never during render.
      setViewerState({ userIdx, storyIdx: firstUnseenIdx, key: Date.now(), isPaused: false });
    }
  };

  const handlePublishNote = async () => {
    if (!noteContent || !user) return;
    await addStory({
      userId: user.id,
      authorName: user.displayName || user.username || "Anonymous",
      authorAvatar: user.avatarUrl,
      type: "note",
      content: noteContent,
      mindId: selectedMindId !== "none" ? selectedMindId : undefined
    });
    setIsAddingNote(false);
    setNoteContent("");
    setSelectedMindId("none");
  };

  if (isLoading) {
    return <div className="h-24 w-full bg-muted/20 animate-pulse rounded-xl mb-6"></div>;
  }

  const activeUserId = viewerState ? orderedUserIds[viewerState.userIdx] : null;
  const activeUserStories = activeUserId ? groupedStories[activeUserId] : null;
  const activeStory = activeUserStories && viewerState ? activeUserStories[viewerState.storyIdx] : null;
  // Viewer media — resolved absolute URLs (see lib/media.ts). Video wins
  // over image so a video story doesn't render its poster as a still.
  const activeVideoUrl = resolveMediaUrl(activeStory ? findStoryVideo(activeStory) : undefined);
  const activeImageUrl = activeStory && !activeVideoUrl ? resolveMediaUrl(findStoryImage(activeStory)) : undefined;

  return (
    <>
      <div className="w-full overflow-x-auto pb-4 mb-2 scrollbar-hide">
        {/* snap-x: tiles align on mobile swipe instead of resting mid-card */}
        <div className="flex gap-3 px-2 snap-x snap-mandatory">
          {/* Add Story card — same 9:16 tile shape as story cards so the tray
              reads as one consistent row (FB-style). */}
          <button
            type="button"
            aria-label="Add a story note"
            className="flex-shrink-0 snap-start cursor-pointer group outline-none"
            onClick={() => setIsAddingNote(true)}
          >
            <div className="relative w-24 sm:w-28 aspect-[9/16] rounded-xl border-2 border-dashed border-primary/50 bg-card hover:bg-muted/50 flex flex-col items-center justify-center gap-2 transition-all duration-200 group-hover:scale-[1.03] group-active:scale-[0.97]">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground">Add Note</span>
            </div>
          </button>

          {/* User Stories — FB-style INLINE PREVIEW CARDS: 9:16 tiles whose
              contents (live image, muted looping video, or text note) are
              visible WITHOUT tapping. The fullscreen viewer stays one tap
              away. Gradient ring = unseen; gray ring + dimmed = viewed. */}
          {orderedUserIds.map((uid) => {
            const userSt = groupedStories[uid];
            const allViewed = userSt.every(s => s.isViewed);
            const latest = userSt[userSt.length - 1];
            // Pick the strongest visual for the tile: video > image > text.
            const videoStory = userSt.find(s => findStoryVideo(s));
            const imageStory = userSt.find(s => findStoryImage(s));
            const previewStory = videoStory ?? imageStory ?? latest;
            const previewVideoUrl = videoStory ? resolveMediaUrl(findStoryVideo(videoStory)) : undefined;
            const previewImageUrl = imageStory ? resolveMediaUrl(findStoryImage(imageStory)) : undefined;
            // Poster = same story's image (helps the muted video preview
            // paint a frame instantly on slow mobile networks).
            const previewPoster = previewVideoUrl ? resolveMediaUrl(findStoryImage(previewStory)) : undefined;
            const previewText = previewStory.content?.trim() || "";
            const displayName = uid === user?.id ? "You" : latest.authorName.split(' ')[0];
            const hasMind = !!(latest.mindId || previewStory.mindId);

            return (
              <button
                key={uid}
                type="button"
                aria-label={`View ${uid === user?.id ? "your" : `${latest.authorName.split(' ')[0]}'s`} stories`}
                onClick={() => handleStoryClick(uid)}
                className="flex-shrink-0 snap-start cursor-pointer group outline-none"
              >
                <div className={`relative w-24 sm:w-28 aspect-[9/16] rounded-xl p-[2px] transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-[0.97] ${allViewed ? "bg-border/60" : "bg-gradient-to-tr from-primary via-amber-500 to-yellow-400"}`}>
                  <div className={`relative w-full h-full rounded-[10px] overflow-hidden bg-card ${allViewed ? "opacity-85" : ""}`}>
                    {previewVideoUrl ? (
                      <SmartMedia src={previewVideoUrl} alt={`${displayName}'s story video`} isVideo poster={previewPoster} />
                    ) : previewImageUrl ? (
                      <SmartMedia src={previewImageUrl} alt={`${displayName}'s story`} isVideo={false} />
                    ) : previewText ? (
                      /* Text note preview — readable inside the tile */
                      <div className="w-full h-full flex items-center justify-center p-2.5 bg-gradient-to-br from-primary/20 via-muted to-accent/40">
                        <span className="text-[11px] leading-snug font-medium text-foreground text-center line-clamp-6 break-words">
                          {previewText.slice(0, 80)}{previewText.length > 80 ? "…" : ""}
                        </span>
                      </div>
                    ) : (
                      /* Fallback: avatar fills the tile (original behavior) */
                      <Avatar className="w-full h-full rounded-none">
                        <AvatarImage src={latest.authorAvatar} />
                        <AvatarFallback className="bg-muted text-sm rounded-none">{latest.authorName?.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    )}

                    {/* Bottom scrim + name (FB-style tile caption) */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-2 pb-2 pt-7 pointer-events-none">
                      <p className="text-[11px] font-semibold text-white truncate drop-shadow-sm">{displayName}</p>
                    </div>

                    {/* Author avatar badge — top-left, ring lifts it off media */}
                    <Avatar className="absolute top-1.5 left-1.5 w-6 h-6 border-2 border-background/90 shadow-sm pointer-events-none">
                      <AvatarImage src={latest.authorAvatar} />
                      <AvatarFallback className="text-[9px] bg-muted rounded-none">{latest.authorName?.slice(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>

                    {/* Video indicator — tiny film badge: the tile plays with
                        sound once opened in the viewer */}
                    {previewVideoUrl && (
                      <div className="absolute top-1.5 right-1.5 bg-black/50 backdrop-blur-sm rounded-full p-1 pointer-events-none">
                        <Film className="w-3 h-3 text-white" />
                      </div>
                    )}

                    {/* Mind badge — story links a decision mind */}
                    {hasMind && !previewVideoUrl && (
                      <div className="absolute top-1.5 right-1.5 bg-primary/90 text-primary-foreground rounded-full p-1 shadow-sm pointer-events-none">
                        <BrainCircuit className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Add Note Modal */}
      <Dialog open={isAddingNote} onOpenChange={setIsAddingNote}>
        <DialogContent className="max-w-sm rounded-[24px]">
          <DialogHeader>
            <DialogTitle>Share a Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>What's on your mind?</Label>
              <Input 
                value={noteContent} 
                onChange={e => setNoteContent(e.target.value)} 
                placeholder="What's up? Share a quick note..." 
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label>Attach a Mind (Optional)</Label>
              <Select value={selectedMindId} onValueChange={setSelectedMindId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a Mind" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {minds.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingNote(false)}>Cancel</Button>
            <Button onClick={handlePublishNote} disabled={!noteContent}>Share Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Story Viewer Modal */}
      <Dialog open={!!viewerState} onOpenChange={(open) => !open && closeViewer()}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-black/95 border-border shadow-2xl h-[80vh] flex flex-col justify-between">
          <AnimatePresence mode="wait">
            {activeStory && !runningMindId && (
              <motion.div 
                key={activeStory.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="w-full h-full flex flex-col p-6 text-white relative select-none"
              >
                {/* Progress Bars */}
                <div className="absolute top-2 left-2 right-2 z-50 flex gap-1">
                  {activeUserStories?.map((story, idx) => (
                    <div key={story.id} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-white transition-all duration-75 ease-linear"
                        style={{
                          width: idx < viewerState.storyIdx ? "100%" : idx === viewerState.storyIdx ? `${progress}%` : "0%"
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Left/Right Click Areas */}
                <div className="absolute inset-0 z-40 flex mt-6">
                  <div 
                    className="w-1/3 h-full cursor-pointer" 
                    onPointerDown={() => {
                      pointerDownTime.current = Date.now();
                      setViewerState(prev => prev ? { ...prev, isPaused: true } : null);
                    }}
                    onPointerUp={() => {
                      setViewerState(prev => prev ? { ...prev, isPaused: false } : null);
                      if (Date.now() - pointerDownTime.current < 200) handlePrev();
                    }}
                    onPointerLeave={() => setViewerState(prev => prev ? { ...prev, isPaused: false } : null)}
                  />
                  <div 
                    className="w-2/3 h-full cursor-pointer" 
                    onPointerDown={() => {
                      pointerDownTime.current = Date.now();
                      setViewerState(prev => prev ? { ...prev, isPaused: true } : null);
                    }}
                    onPointerUp={() => {
                      setViewerState(prev => prev ? { ...prev, isPaused: false } : null);
                      if (Date.now() - pointerDownTime.current < 200) handleNext();
                    }}
                    onPointerLeave={() => setViewerState(prev => prev ? { ...prev, isPaused: false } : null)}
                  />
                </div>

                {/* Story Header */}
                <div className="flex items-center gap-3 mb-8 mt-4 relative z-50 pointer-events-none">
                  <Avatar className="w-10 h-10 border border-white/20">
                    <AvatarImage src={activeStory.authorAvatar} />
                    <AvatarFallback>{activeStory.authorName?.slice(0,2)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-medium">{activeStory.authorName}</h3>
                    <p className="text-xs text-white/60">
                      {new Date(activeStory.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center text-center relative z-30 pointer-events-none">
                  {activeStory.type === "note" && !activeVideoUrl && !activeImageUrl ? (
                    <div className="bg-white/10 backdrop-blur-md p-8 rounded-[24px] border border-white/20">
                      <p className="text-2xl font-serif leading-relaxed">
                        {activeStory.content}
                      </p>
                    </div>
                  ) : activeVideoUrl ? (
                    /* Video story — the user tapped to open it, so sound is
                       allowed (mobile autoplay policies permit audio after a
                       user gesture). The player sits ABOVE the tap-to-navigate
                       zones (z-40) so controls/seeking work; the screen edges
                       still navigate. Real duration drives the progress bar
                       via clampStoryVideoDuration (clamped 3s–60s). */
                    <div className="relative z-[45] pointer-events-auto flex flex-col items-center gap-4 max-w-full">
                      <video
                        key={activeStory.id}
                        src={activeVideoUrl}
                        controls
                        autoPlay
                        playsInline
                        preload="metadata"
                        className="max-h-[55vh] max-w-full rounded-[16px] bg-black/70"
                        onLoadedMetadata={(e) => {
                          storyDurationRef.current = clampStoryVideoDuration(e.currentTarget.duration);
                        }}
                        onError={(e) => {
                          // Unfetchable source → hide the dead player; the
                          // note text below still renders (graceful mobile
                          // fallback, no broken player chrome).
                          e.currentTarget.style.display = "none";
                        }}
                      />
                      {activeStory.content && (
                        <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-[18px] border border-white/20 max-w-md">
                          <p className="text-lg font-serif leading-relaxed">
                            {activeStory.content}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Media story (image) — absolute URL + no-referrer. */
                    <div className="flex flex-col items-center gap-4 max-w-full">
                      <img
                        src={activeImageUrl}
                        alt="Story"
                        loading="eager"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                        className="max-h-[60vh] max-w-full rounded-[16px] object-contain pointer-events-none"
                      />
                      {activeStory.content && (
                        <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-[18px] border border-white/20 max-w-md">
                          <p className="text-lg font-serif leading-relaxed">
                            {activeStory.content}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {activeStory.mindId && (
                  <div className="mt-8 mb-4 relative z-50">
                    <div className="bg-white/10 border border-white/20 p-4 rounded-[16px] flex items-center justify-between backdrop-blur-sm cursor-pointer hover:bg-white/20 transition-colors"
                         onClick={() => setRunningMindId(activeStory.mindId!)}>
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center border border-primary/30">
                           <BrainCircuit className="w-5 h-5 text-primary" />
                         </div>
                         <div className="text-left">
                           <p className="text-sm font-medium">Attached Mind</p>
                           <p className="text-xs text-white/60">Tap to run this module</p>
                         </div>
                      </div>
                      <Button 
                        size="icon"
                        className="rounded-full bg-white text-black hover:bg-white/90 pointer-events-none"
                      >
                        <Play className="w-4 h-4 ml-0.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {runningMindId && (
              <motion.div 
                key="runtime"
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full h-full bg-background flex flex-col relative"
              >
                <div className="flex items-center justify-between p-2 border-b bg-card">
                  <span className="text-sm font-medium ml-2">Running Mind</span>
                  <Button variant="ghost" size="sm" onClick={() => setRunningMindId(null)}>Close</Button>
                </div>
                <div className="flex-1 overflow-hidden relative">
                   <RuntimeEngine 
                     mind={minds.find(b => b.id === runningMindId) || null} 
                     isOpen={!!runningMindId}
                     onClose={() => setRunningMindId(null)} 
                   />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </>
  );
}
