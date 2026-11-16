import { useEffect, useState, useMemo, useCallback, lazy, Suspense } from "react";
import { useSocial } from "@/hooks/use-social";
import { useTopics } from "@/hooks/use-topics";
import { PostCard } from "@/components/feed/PostCard";
import { PostSkeleton } from "@/components/feed/PostSkeleton";
import { FloatingCreateButton } from "@/components/ui/CreateExperienceModal";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CircleHelp, MessageSquare, PenSquare, BrainCircuit, X } from "lucide-react";
import { Post, PostType, Topic } from "@/lib/types";
import { useCommunities } from "@/hooks/use-communities";
import { MomentumWidget } from "@/components/momentum/MomentumWidget";
import { useLocation } from "wouter";
import { trackEvent } from "@/lib/analytics";
import { getPostUpvoteCount } from "@/lib/types";
import { useAuth } from "@/components/auth/AuthContext";
import { userIdOr, displayNameOr } from "@/lib/user-data";
import { FeedMode, rankHomeFeedPosts, rankRelatedTopics } from "@/lib/recommendations";
import { triggerHaptic } from "@/lib/device";
import { useAnalyticsEvents } from "@/hooks/use-recommendations";
import { useToast } from "@/hooks/use-toast";

import { DailyChallengesSection } from "@/feed/DailyChallengesSection";
import { LiveSessionBanner } from "@/feed/LiveSessionBanner";
import { PeopleYouMayKnow } from "@/feed/PeopleYouMayKnow";
import { FindFriendsFromContacts } from "@/feed/FindFriendsFromContacts";
import { FindFriendsFromGmail } from "@/feed/FindFriendsFromGmail";
import {
  COLD_START_POSTS,
  shouldShowColdStartBanner,
  dismissColdStartBanner,
} from "@/lib/cold-start-content";

// PERF: StoriesBar imports framer-motion (~125 KB / ~40 KB gzip). Lazy-load
// it so framer-motion stays off the critical path — it loads after first
// paint. Suspense fallback preserves layout height to avoid CLS.
const StoriesBar = lazy(() => import("@/feed/StoriesBar").then(m => ({ default: m.StoriesBar })));

const NeuralGraph = lazy(() => import("@/components/NeuralGraph").then(m => ({ default: m.NeuralGraph })));
const PostCreator = lazy(() => import("@/components/feed/PostCreator").then((module) => ({ default: module.PostCreator })));

// Helper to seed data if empty
const SEED_TOPICS: Topic[] = [
  { id: "t1", name: "Engineering", description: "Software and Hardware", followerCount: 1200 },
  { id: "t2", name: "Philosophy", description: "Deep thoughts", followerCount: 800 },
  { id: "t3", name: "React", description: "UI Framework", followerCount: 2000 }
];

export function HomeFeed() {
  // B3: activeFeed must live ABOVE useSocial — the Following tab now drives
  // a real server query (mode=following) instead of only re-ranking locally.
  const [activeFeed, setActiveFeed] = useState<FeedMode>("foryou");
  const { posts, isLoading, addPost, reactToPost, refreshPosts, feedFailed, refetchFeed, fetchNextPage, hasNextPage, isFetchingNextPage } = useSocial(activeFeed, null);
  const { topics, addTopic, refreshTopics } = useTopics();
  const { communities } = useCommunities();
  const { data: analyticsEvents = [] } = useAnalyticsEvents();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  // Phase 2: real user identity.
  const { user } = useAuth();
  const currentUserId = userIdOr(user);
  const currentDisplayName = displayNameOr(user);
  // B3: the Following view gets its own honest empty state instead of the
  // For-You dry state (whose "Share Your First Brain" CTA makes no sense
  // under Following). Keyed on feed EMPTINESS, not auth: guests may carry an
  // anonymous Firebase session (user non-null), and signed-in users with no
  // follows need the same message.
  const isFollowingEmpty = activeFeed === "following" && !isLoading && posts.length === 0;
  
  const graphData = useMemo(() => {
    const nodes = topics.map(t => ({ id: t.id, name: t.name }));
    const links: { source: string; target: string }[] = [];
    
    const userTopics: Record<string, Set<string>> = {};
    const validTopicIds = new Set(topics.map(t => t.id));
    posts.forEach(post => {
      if (!userTopics[post.userId]) userTopics[post.userId] = new Set();
      if (validTopicIds.has(post.topicId)) {
        userTopics[post.userId].add(post.topicId);
      }
    });
    
    Object.values(userTopics).forEach(set => {
      const arr = Array.from(set);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          links.push({ source: arr[i], target: arr[j] });
        }
      }
    });
    
    return { nodes, links };
  }, [posts, topics]);

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  // FRAGMENT C: Reddit-style sort modes.
  type FeedSort = "hot" | "new" | "top" | "rising";
  const [sortMode] = useState<FeedSort>("hot");
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [creatorPostType, setCreatorPostType] = useState<PostType>("post");
  const [selectedQuestionForAnswer, setSelectedQuestionForAnswer] = useState<{
    id: string;
    title: string;
    details?: string;
    authorName?: string;
    communityId?: string;
    communityName?: string;
    topicId?: string;
    topicName?: string;
  } | null>(null);

  // CreateMenu deep link: /?compose=1 auto-opens the post composer once
  // (fired by the "+ Create" launcher in the app shell). Two paths both
  // idempotently open the composer:
  //   1. window event "bd:open-composer" — handles "already on home"
  //      (wouter does not re-run effects for search-only changes).
  //   2. mount-time query check — handles "navigated from another page".
  const openComposerFromMenu = useCallback(() => {
    setCreatorPostType("post");
    setSelectedQuestionForAnswer(null);
    setIsCreatorOpen(true);
    if (window.location.search.includes("compose=1")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  useEffect(() => {
    if (window.location.search.includes("compose=1")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate mount-sync of the URL compose param → open the post composer; refactoring to derived state would change behavior (one-time deep-link trigger + window event subscription).
      openComposerFromMenu();
    }
    window.addEventListener("bd:open-composer", openComposerFromMenu);
    return () => window.removeEventListener("bd:open-composer", openComposerFromMenu);
  }, [openComposerFromMenu]);

  const [isSeeding, setIsSeeding] = useState(false);

  // Extract all question posts to feed into the Answer picker
  const existingQuestionsList = useMemo(() => {
    return posts
      .filter((p) => p.postType === "question")
      .map((p) => {
        const topic = topics.find((t) => t.id === p.topicId);
        return {
          id: p.id,
          title: p.content,
          details: p.questionDetails,
          authorName: p.userId === currentUserId ? currentDisplayName : `User ${(p.userId || "anon").substring(0, 4)}`,
          communityId: p.communityId,
          communityName: p.communityName,
          topicId: p.topicId,
          topicName: topic?.name,
          createdAt: p.createdAt,
          answerCount: p.commentCount || 0,
        };
      });
  }, [posts, topics, currentDisplayName, currentUserId]);

  useEffect(() => {
    const seedData = async () => {
      // B3: seeding is a For-You cold-start concern. On the Following view
      // posts are cloud-only (legitimately empty for new users) — seeding
      // here would loop forever: seeds land in the For-You universe,
      // Following never sees them, posts.length stays 0 → re-seed → ∞.
      // That loop was the fuel of the 401/429 rate-limit cascade before the
      // guest local-only fix.
      if (activeFeed === "following") return;
      if (isLoading || isSeeding || (posts.length > 0 && topics.length > 0)) return;

      setIsSeeding(true);
      try {
        if (topics.length === 0) {
          for (const topic of SEED_TOPICS) await addTopic(topic);
        }
        if (posts.length === 0) {
          // Phase 5 — seed with the full 12-post cold-start pool so the
          // feed is never blank for new users. Mixes across all 6 topics.
          for (const post of COLD_START_POSTS) await addPost(post);
        }
        await refreshTopics();
        await refreshPosts();
      } catch (error) {
        console.error("Failed to seed the home feed", error);
        toast({
          title: "Feed setup failed",
          description: "We could not load starter content. Please refresh and try again.",
          variant: "destructive",
        });
      } finally {
        setIsSeeding(false);
      }
    };
    void seedData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seeding must only re-trigger on feed/topic/loading state, not on the stable mutation identities (addPost/addTopic/refreshPosts/refreshTopics); listing them would re-seed on every mutation refetch.
  }, [activeFeed, posts.length, topics.length, isLoading, isSeeding, toast]);

  // Phase 5 — Cold-start banner state. Shown when user follows <3 topics
  // and hasn't dismissed it explicitly.
  const [showColdStartBanner, setShowColdStartBanner] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate sync of external storage flag (banner dismissal) + topics.length → banner visibility; refactoring to derived state would change behavior (dismissal is an optimistic local override reset on topics change).
    setShowColdStartBanner(shouldShowColdStartBanner(topics.length));
  }, [topics.length]);
  const handleDismissBanner = () => {
    dismissColdStartBanner();
    setShowColdStartBanner(false);
  };

  const [displayLimit, setDisplayLimit] = useState(5);
  const [observerRef, setObserverRef] = useState<HTMLDivElement | null>(null);

  // A clock value read in an effect (not during render) so the "rising" sort
  // and any time-relative filtering stay pure during render. Refreshed on a
  // 60s timer — the only consumer is a 24h "recent" threshold, so sub-minute
  // staleness is behaviorally equivalent to the previous per-render Date.now().
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate event-driven reset: reset displayLimit to 5 when the feed mode or selected topic changes; refactoring to derived state would change behavior (displayLimit is user-incremented via IntersectionObserver).
    setDisplayLimit(5);
  }, [activeFeed, selectedTopicId]);

  const handleFeedChange = (value: string) => {
    triggerHaptic("selection");
    const nextFeed = value as FeedMode;
    setActiveFeed(nextFeed);
    void trackEvent("feed_mode_selected", { mode: nextFeed });
  };

  const handleTopicSelect = (topicId: string | null) => {
    triggerHaptic("selection");
    setSelectedTopicId(topicId);
    void trackEvent("topic_selected", { topicId: topicId || "all" });
  };

  const recommendedTopics = useMemo(
    () => rankRelatedTopics(posts, topics, analyticsEvents),
    [posts, topics, analyticsEvents],
  );

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      // Progressive reveal keeps scroll smooth (5 posts at a time)…
      setDisplayLimit((prev) => prev + 5);
      // B4: …and when the reveal window reaches the loaded set, pull the
      // next server page. Previously the feed was hard-capped at page 1
      // (30 posts) because the server's offset/hasMore were never wired.
      if (hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });

    if (observerRef) {
      observer.observe(observerRef);
    }

    // B8: disconnect() tears the observer down completely — the old
    // unobserve()-only cleanup leaked one observer per ref change.
    return () => {
      observer.disconnect();
    };
  }, [observerRef, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const openCreator = (
    postType: PostType = "post",
    questionTarget: {
      id: string;
      title: string;
      details?: string;
      authorName?: string;
      communityId?: string;
      communityName?: string;
      topicId?: string;
      topicName?: string;
    } | null = null,
  ) => {
    setCreatorPostType(postType);
    setSelectedQuestionForAnswer(questionTarget);
    setIsCreatorOpen(true);
  };

  const handleCreatePost = useCallback(async (post: Post) => {
    await addPost(post);
  }, [addPost]);

  // Memoize the displayed posts list so we don't re-run the full O(N log N)
  // rankHomeFeedPosts sort + analytics-event iteration on every render /
  // scroll tick. Re-runs only when the inputs change (posts, topics,
  // analyticsEvents, activeFeed, selectedTopicId, displayLimit, AND
  // location — so in-page navigation to /?postId=... is picked up).
  const displayedPosts = useMemo(() => {
    const searchParams = new URLSearchParams(
      typeof location === "string" && location.includes("?")
        ? location.split("?")[1] ?? ""
        : ""
    );
    const postIdFromUrl = searchParams.get("postId");

    // Filter out hidden posts (user clicked "Hide Post" in PostCard).
    let hiddenIds: string[] = [];
    try {
      const raw = localStorage.getItem("brainDrain_hiddenPosts");
      if (raw) hiddenIds = JSON.parse(raw) as string[];
    } catch { /* ignore */ }
    const visiblePosts = hiddenIds.length > 0 ? posts.filter(p => !hiddenIds.includes(p.id)) : posts;

    let allDisplayedPosts = postIdFromUrl
      ? visiblePosts.filter(p => p.id === postIdFromUrl)
      : rankHomeFeedPosts({
          posts: visiblePosts,
          topics,
          events: analyticsEvents,
          mode: activeFeed,
          selectedTopicId,
        });

    // FRAGMENT C: Apply Reddit-style sort mode on top of the ranked feed.
    if (!postIdFromUrl) {
      if (sortMode === "new") {
        allDisplayedPosts = [...allDisplayedPosts].sort((a, b) => b.createdAt - a.createdAt);
      } else if (sortMode === "top") {
        allDisplayedPosts = [...allDisplayedPosts].sort((a, b) =>
          (getPostUpvoteCount(b) + (b.commentCount || 0) * 2) -
          (getPostUpvoteCount(a) + (a.commentCount || 0) * 2)
        );
      } else if (sortMode === "rising") {
        // Rising = high velocity: posts < 24h old with above-median engagement.
        const dayMs = 24 * 60 * 60 * 1000;
        const recent = allDisplayedPosts.filter(p => now - p.createdAt < dayMs);
        if (recent.length > 0) {
          const medianEngagement = recent.sort((a, b) =>
            getPostUpvoteCount(a) - getPostUpvoteCount(b)
          )[Math.floor(recent.length / 2)];
          const threshold = getPostUpvoteCount(medianEngagement);
          allDisplayedPosts = recent
            .filter(p => getPostUpvoteCount(p) >= threshold)
            .sort((a, b) => getPostUpvoteCount(b) - getPostUpvoteCount(a));
        }
      }
      // "hot" = default gravity ranking from rankHomeFeedPosts (no re-sort)
    }

    return allDisplayedPosts.slice(0, displayLimit);
  }, [posts, topics, analyticsEvents, activeFeed, selectedTopicId, displayLimit, location, sortMode, now]);

  if (isLoading || isSeeding) {
    return (
      <div className="max-w-2xl mx-auto min-h-screen border-x border-border/50 bg-background/50 p-4 space-y-4">
        {[1, 2, 3].map((i) => <PostSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto min-h-screen border-x border-border/50 bg-background/50">
      
      <div className="bg-background pt-4 border-b border-border/40">
        <Suspense fallback={<div className="h-24" aria-hidden="true" />}>
          <StoriesBar />
        </Suspense>
      </div>

      <MomentumWidget />

      {/* Feed fetch failure banner — shows when /api/feed failed (non-auth)
          and we are showing cached/seed fallback. Dismissible; Retry refetches. */}
      {feedFailed && (
        <div className="mx-3 mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3" role="alert">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Couldn’t load the latest posts from the server.
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Showing saved posts for now. Check your connection and retry.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetchFeed()}
              className="shrink-0 rounded-md bg-destructive/10 hover:bg-destructive/20 px-3 py-1.5 text-xs font-medium text-destructive border border-destructive/20"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Phase 5 — Cold-start banner (dismissible) */}
      {showColdStartBanner && (
        <div className="mx-3 mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Discovering posts for you — follow topics to personalize.
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Showing curated starter content. Follow 3+ topics to tune your feed.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismissBanner}
              aria-label="Dismiss banner"
              className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Phase 3 + 6 + 7 — discovery widgets */}
      <div className="px-3 pt-3 space-y-3">
        <PeopleYouMayKnow />
        <FindFriendsFromContacts />
        <FindFriendsFromGmail />
      </div>

      <div className="sticky top-0 z-20 bg-background/85 backdrop-blur-xl border-b border-border/40">
        <Tabs value={activeFeed} onValueChange={handleFeedChange} className="w-full">
          <TabsList aria-label="Feed view" className="bg-transparent w-full h-12 flex p-0 border-b-0">
            <TabsTrigger value="foryou" className="flex-1 h-full relative data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:font-bold rounded-none px-4 pb-0 text-[15px] font-medium text-muted-foreground hover:bg-muted/15 transition-all cursor-pointer">
              <span className="relative py-3">
                For You
                {activeFeed === "foryou" && (
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-full" />
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger value="following" className="flex-1 h-full relative data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:font-bold rounded-none px-4 pb-0 text-[15px] font-medium text-muted-foreground hover:bg-muted/15 transition-all cursor-pointer">
              <span className="relative py-3">
                Following
                {activeFeed === "following" && (
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-full" />
                )}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {/* Sort mode chips (Hot/New/Top/Rising) intentionally removed from
            the home feed UI per the dry-state design goal — the app should
            feel calm and natural, not like an engagement-optimised Reddit
            feed. The sortMode state and ranking logic are preserved for
            future use (e.g. the Topics page can surface them as needed);
            the home feed just always renders in the default "hot" order. */}
      </div>

      {/* Topic filter chips removed — the homepage now feels like a
          coherent expert-system social network rather than an engineering
          dashboard. The feed logic (selectedTopicId, handleTopicSelect)
          is preserved for use by the Topics page and deep links; the
          chips just no longer clutter the home feed. */}

      <div className="p-4 border-b border-border/40">
        <LiveSessionBanner />
      </div>

      <div className="p-4 border-b border-border/40">
        <DailyChallengesSection />
      </div>

      <div className="p-4 border-b border-border/40">
        <div
          role="button"
          tabIndex={0}
          aria-label="Create a new post"
          className="w-full flex items-center gap-3.5 bg-muted/20 p-3 rounded-2xl cursor-text hover:bg-muted/30 active:scale-[0.99] transition-all border border-border/40 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => openCreator("post")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openCreator("post");
            }
          }}
        >
          <div className="w-9 h-9 rounded-full bg-muted flex flex-shrink-0 items-center justify-center text-foreground font-semibold text-xs border border-border/40">
            ME
          </div>
          <div className="flex-1 text-muted-foreground text-[14px]">
            What's on your mind? Share a decision brain...
          </div>
          <button
            type="button"
            tabIndex={-1}
            className="inline-flex items-center justify-center rounded-full px-4 font-semibold h-7 bg-primary text-primary-foreground hover:bg-primary/90 text-xs shadow-none cursor-pointer"
            onClick={(event) => { event.stopPropagation(); openCreator("post"); }}
          >
            Post
          </button>
        </div>
        <div className="flex items-center justify-between gap-1 sm:gap-2 mt-2.5 px-1">
          <Button
            variant="ghost"
            className="flex-1 gap-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/30 text-xs h-8 active:scale-95"
            onClick={() => openCreator("question")}
          >
            <CircleHelp className="w-3.5 h-3.5" />
            <span>Ask</span>
          </Button>
          <Button
            variant="ghost"
            className="flex-1 gap-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/30 text-xs h-8 active:scale-95"
            onClick={() => openCreator("answer")}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Answer</span>
          </Button>
          <Button
            variant="ghost"
            className="flex-1 gap-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/30 text-xs h-8 active:scale-95"
            onClick={() => openCreator("post")}
          >
            <PenSquare className="w-3.5 h-3.5" />
            <span>Post</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-2 sm:p-4 pb-24">
        {displayedPosts.length > 0 ? (
          <>
            {displayedPosts.map(post => {
              const topic = topics.find(t => t.id === post.topicId);
              return (
                // content-visibility:auto lets the browser skip rendering
                // off-screen posts entirely (paint, layout, the works).
                // containIntrinsicSize reserves ~600px so the scrollbar
                // doesn't jump as posts enter/leave the viewport. This is
                // the "high-performance list" pattern: 100 posts cost the
                // same as 10 to render — only the visible 10 are painted.
                <div
                  key={post.id}
                  className="animate-in fade-in duration-700"
                  style={{
                    contentVisibility: 'auto',
                    containIntrinsicSize: '600px',
                  }}
                >
                  <PostCard
                    post={post}
                    onReact={reactToPost}
                    topicName={topic?.name}
                    authorName={post.userId === currentUserId ? currentDisplayName : `User ${(post.userId || "anon").substring(0, 4)}`}
                    onAnswerQuestion={(qPost) => {
                      const qTopic = topics.find(t => t.id === qPost.topicId);
                      openCreator("answer", {
                        id: qPost.id,
                        title: qPost.content,
                        details: qPost.questionDetails,
                        authorName: qPost.userId === currentUserId ? currentDisplayName : `User ${(qPost.userId || "anon").substring(0, 4)}`,
                        communityId: qPost.communityId,
                        communityName: qPost.communityName,
                        topicId: qPost.topicId,
                        topicName: qTopic?.name,
                      });
                    }}
                  />
                </div>
              );
            })}
            <div ref={setObserverRef} className="h-4" />
            {isFetchingNextPage && (
              <div className="py-3 text-center text-xs text-muted-foreground" role="status">
                Loading more reasoning…
              </div>
            )}
          </>
        ) : isFollowingEmpty ? (
          <div className="p-8 text-center">
            {/* B3: Following empty view — honest empty state instead of
                silently reusing For-You content. */}
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <BrainCircuit className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-lg text-foreground">Following is quiet</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {currentUserId
                  ? "Posts from the people you follow will appear here. Follow more voices to fill this feed."
                  : "Sign in and follow the thinkers you trust — their reasoning will collect here."}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center">
            {/* Dry state — this is what a brand-new user sees. It must
                explain the value proposition, not just say "be the first
                to post." The app should feel like a knowledge library
                waiting to be filled, not an empty social feed. */}
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <BrainCircuit className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-lg text-foreground">Your Knowledge Feed Awaits</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Brain Drain is a human knowledge engine. Every post can have a
                structured decision Brain attached. Readers vote every comment
                up or down and classify it House or Mouth — the strongest
                reasoning rises into a living consensus library.
              </p>
              <p className="text-xs text-muted-foreground/70 italic">
                This is not a social feed. It's a living library of expert reasoning.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <Button onClick={() => openCreator("post")}>
                  <PenSquare className="w-4 h-4 mr-2" /> Share Your First Brain
                </Button>
                <Button variant="outline" onClick={() => openCreator("question")}>
                  <CircleHelp className="w-4 h-4 mr-2" /> Ask the Community
                </Button>
              </div>
              {location.includes("postId=") ? (
                <Button variant="ghost" className="mt-1" onClick={() => setLocation("/")}>View All Posts</Button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {posts.length > 0 && (
        <>
          <div className="p-6 border-t border-border/50 bg-muted/20">
            <h3 className="font-semibold text-lg mb-4">Related Topics</h3>
            <div className="flex flex-wrap gap-2">
              {recommendedTopics.map(topic => (
                <Button
                  key={topic.id}
                  variant="outline"
                  className="rounded-full"
                  onClick={() => handleTopicSelect(topic.id)}
                >
                  #{topic.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="p-6 border-t border-border/50">
            <h3 className="font-semibold text-lg mb-4">Neural Framework</h3>
            <Suspense fallback={<div className="h-64 animate-pulse bg-muted rounded-[16px]" />}>
              <NeuralGraph nodes={graphData.nodes} links={graphData.links} />
            </Suspense>
          </div>
        </>
      )}

      <FloatingCreateButton onCreatePost={() => openCreator("post")} />

      {isCreatorOpen && (
        <Suspense fallback={null}>
          <PostCreator
            isOpen={isCreatorOpen}
            onClose={() => {
              setIsCreatorOpen(false);
              setSelectedQuestionForAnswer(null);
            }}
            onPostCreated={handleCreatePost}
            topics={topics}
            communities={communities}
            postType={creatorPostType}
            existingQuestions={existingQuestionsList}
            initialSelectedQuestion={selectedQuestionForAnswer}
          />
        </Suspense>
      )}
    </div>
  );
}