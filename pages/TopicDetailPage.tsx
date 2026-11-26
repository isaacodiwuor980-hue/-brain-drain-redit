import { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Hash, Users, ArrowLeft, ArrowBigDown, ArrowBigUp, MessageSquare, Share2 } from "lucide-react";
import { useTopics } from "@/hooks/use-topics";
import { useSocial } from "@/hooks/use-social";
import { getPostDownvoteCount, getPostUpvoteCount, Topic } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { triggerHaptic } from "@/lib/device";
import { useToast } from "@/hooks/use-toast";

export function TopicDetailPage({ params }: { params: { id: string } }) {
  const { topics, isLoading: topicsLoading, followTopic } = useTopics();
  const { posts, isLoading: postsLoading, reactToPost } = useSocial();
  const [, setLocation] = useLocation();
  const [topic, setTopic] = useState<Topic | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!topicsLoading) {
      const found = topics.find(t => t.id === params.id);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate sync of the topics query → local topic state with an optimistic follow override (handleToggleFollow mutates it); refactoring to derived state would lose the optimistic UI update.
      setTopic(found || null);
    }
  }, [topics, params.id, topicsLoading]);

  // topicPosts is purely derived from posts + topic (no local mutation), so
  // compute it during render instead of mirroring it into state.
  const topicPosts = useMemo(
    () => (topic ? posts.filter(p => p.topicId === topic.id) : []),
    [posts, topic],
  );

  const handleAction = (action: string) => {
    triggerHaptic("selection");
    if (action === "Start a Discussion") {
      // Navigate to home feed with the topic pre-selected
      setLocation(`/?topic=${topic?.id || ""}`);
    } else if (action === "Share Post" || action === "Open Discussion") {
      // Copy the topic URL to clipboard
      const url = `${window.location.origin}/topics/${topic?.id || ""}`;
      navigator.clipboard?.writeText(url).then(() => {
        toast({ title: "Link copied", description: "Topic link copied to clipboard." });
      }).catch(() => {
        toast({ title: action, description: "Sharing is available via the post's share button." });
      });
    } else if (action === "Load Mind") {
      setLocation("/library");
    } else {
      toast({ title: action, description: `Opening ${action.toLowerCase()}…` });
    }
  };

  const handleToggleFollow = async () => {
    if (!topic) return;
    const isNowFollowed = !topic.isFollowed;
    // BUG-001 FIX: call the hook's followTopic mutation so the change
    // persists to IDB (and cloud sync if configured). Previously this only
    // called setTopic() — the follow state was lost on page navigation.
    try {
      await followTopic(topic.id, isNowFollowed);
      // Update local state for immediate UI feedback. The hook's
      // onSuccess invalidates the ["topics"] query which will refetch
      // and update the `topics` array, which the effect at line 18
      // syncs into `topic` state. But setting it here too avoids a
      // flash of the old state between mutation success and refetch.
      setTopic({ ...topic, isFollowed: isNowFollowed, followerCount: topic.followerCount + (isNowFollowed ? 1 : -1) });
      toast({
        title: isNowFollowed ? "Following Topic" : "Unfollowed Topic",
        description: isNowFollowed ? `You are now following ${topic.name}` : `You are no longer following ${topic.name}`,
      });
    } catch {
      toast({
        title: "Couldn't update follow status",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (topicsLoading || postsLoading) {
    return <div className="p-6 text-center text-muted-foreground animate-pulse">Loading topic...</div>;
  }

  if (!topic) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-2xl font-bold">Topic not found</h2>
        <Link href="/topics">
          <Button variant="link" className="mt-4">Back to Topics</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto border-x min-h-screen bg-card/30">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b p-4 flex items-center gap-4">
        <Link href="/topics" aria-label="Back to topics">
          <Button variant="outline" size="sm" className="gap-2 rounded-full border-border/60 hover:bg-accent/50 text-muted-foreground hover:text-foreground cursor-pointer" tabIndex={-1} aria-hidden="true">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Topics</span>
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-1">
            <Hash className="w-5 h-5 text-primary" />
            {topic.name}
          </h1>
          <p className="text-sm text-muted-foreground">{topicPosts.length} posts</p>
        </div>
      </div>

      {/* Topic Info */}
      <div className="p-6 border-b bg-card">
        <p className="text-lg mb-4">{topic.description}</p>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {topic.followerCount} followers</span>
        </div>
        <div className="mt-6 flex gap-2">
          <Button variant={topic.isFollowed ? "secondary" : "default"} aria-pressed={topic.isFollowed} className="w-full sm:w-auto px-8" onClick={handleToggleFollow}>
            {topic.isFollowed ? "Following" : "Follow"}
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => handleAction("Start a Discussion")}>Start a Discussion</Button>
        </div>
      </div>

      {/* Posts Feed */}
      <div className="divide-y">
        {topicPosts.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No posts in this topic yet.</p>
          </div>
        ) : (
          topicPosts.map(post => (
            <div key={post.id} className="p-6 hover:bg-muted/50 transition-colors">
              <div className="flex gap-4">
                <Avatar className="w-10 h-10 border border-border">
                  <AvatarFallback className="bg-primary/10 text-primary">{(post.userId || "?").substring(0,2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{post.userId}</span>
                    <span className="text-muted-foreground text-sm">· {new Date(post.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="whitespace-pre-wrap mb-4 text-sm sm:text-base leading-relaxed">{post.content}</p>
                  
                  {post.mediaUrls && post.mediaUrls.length > 0 && (
                     <div className="mb-4 rounded-[16px] overflow-hidden border">
                      <img src={post.mediaUrls[0]} alt="Post media" loading="lazy" decoding="async" className="w-full h-auto object-cover max-h-96" />
                    </div>
                  )}
                  
                  {post.mindId && (
                    <div className="mb-4 p-3 rounded-[16px] border bg-card/50 flex items-center gap-3 cursor-pointer hover:bg-card transition-colors" onClick={() => handleAction("Load Mind")}>
                      <div className="p-2 rounded bg-primary/20 text-primary">
                        <Hash className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">Attached Mind</div>
                        <div className="text-xs text-muted-foreground">Click to explore logic</div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Button variant="ghost" size="sm" aria-label="Upvote" className="h-8 px-2 gap-2 hover:text-primary" onClick={() => reactToPost(post.id, "upvote")}>
                      <ArrowBigUp className="w-4 h-4" />
                      <span className="text-xs">Upvote {getPostUpvoteCount(post)}</span>
                    </Button>
                    <Button variant="ghost" size="sm" aria-label="Downvote" className="h-8 px-2 gap-2 hover:text-destructive" onClick={() => reactToPost(post.id, "downvote")}>
                      <ArrowBigDown className="w-4 h-4" />
                      <span className="text-xs">Downvote {getPostDownvoteCount(post)}</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2 gap-2 hover:text-primary" onClick={() => handleAction("Open Discussion")}>
                      <MessageSquare className="w-4 h-4" />
                      <span className="text-xs">{post.commentCount || 0}</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2 gap-2" onClick={() => handleAction("Share Post")}>
                      <Share2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
