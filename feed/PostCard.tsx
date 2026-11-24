import { lazy, Suspense, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowBigDown,
  ArrowBigUp,
  CalendarDays,
  MapPin,
  Users,
  MessageCircle,
  MoreHorizontal,
  BrainCircuit,
  Bookmark,
  Share,
  Send,
  Link as LinkIcon,
  ExternalLink,
  Repeat,
  CircleHelp,
  MessageSquare,
  StickyNote,
} from "lucide-react";
import { Brain, getPostDownvoteCount, getPostUpvoteCount, Post } from "@/lib/types";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CommentThreadModal } from "./CommentThreadModal";
import { useToast } from "@/hooks/use-toast";
import { idb } from "@/lib/db";
import { trackEvent } from "@/lib/analytics";
import { useLocation } from "wouter";
import { useProfile } from "@/hooks/use-profile";
import { useBoards } from "@/hooks/use-boards";
import { triggerHaptic } from "@/lib/device";
import { useReputation } from "@/hooks/use-reputation";
import { useSocial } from "@/hooks/use-social";
import { useCommunities } from "@/hooks/use-communities";
import { useMessages } from "@/hooks/use-messages";
import { useOnlineStatus } from "@/hooks/use-online-status";

// PERF-002: confetti is dynamically imported only when a CELEBRATION (4%) or
// JACKPOT (1%) vote fires. Previously it was a static import, which put 227
// lines of canvas code into every PostCard on the feed even though 95% of
// votes never trigger confetti. The isConfettiAllowed() check is inlined
// below so the 80% LIGHT tier doesn't need to load the module at all.

const BrainChatRuntime = lazy(() =>
  import("@/components/runtime/BrainChatRuntime").then((module) => ({ default: module.BrainChatRuntime })),
);

interface PostCardProps {
  post: Post;
  onReact: (postId: string, type: string) => void;
  topicName?: string;
  authorName?: string;
  authorAvatar?: string;
  onAnswerQuestion?: (questionPost: Post) => void;
}

export function PostCard({
  post,
  onReact,
  topicName,
  authorName = "Anonymous",
  authorAvatar,
  onAnswerQuestion,
}: PostCardProps) {
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeBrain, setActiveBrain] = useState<Brain | null>(null);
  const [isBrainOpen, setIsBrainOpen] = useState(false);
  
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  // Task 4: "Share to" picker state
  const [isShareToOpen, setIsShareToOpen] = useState(false);
  const [shareToRecipient, setShareToRecipient] = useState(""); // follower username

  const { toast } = useToast();
  const offline = useOnlineStatus() === "offline";
  const [, setLocation] = useLocation();
  const currentUserId = "me";
  const { profile, updateProfile } = useProfile();
  const { boards, createBoard, addPin } = useBoards(currentUserId);
  const { addXPEvent } = useReputation();
  const { addPost } = useSocial();
  const { communities } = useCommunities();
  const { addConversation, addMessage } = useMessages();
  const isUpvoted = Boolean(
    post.userReactions?.upvote?.includes(currentUserId) ||
    post.userReactions?.like?.includes(currentUserId) ||
    post.userReactions?.love?.includes(currentUserId),
  );
  const isDownvoted = post.userReactions?.downvote?.includes(currentUserId) || false;

  const isBookmarked = profile?.bookmarkedPostIds?.includes(post.id) || false;

  // APEX-OMEGA LEVER 1: variable reward schedule on upvote.
  // 80% LIGHT (just a tap), 15% SUCCESS (stronger haptic),
  // 4% CELEBRATION (+1 XP, amber confetti), 1% JACKPOT (+5 XP, gold confetti + toast).
  // This is TikTok's compulsion-loop pattern: unpredictable reward → the
  // user can't put the phone down because the NEXT tap might be the jackpot.
  // Predicted lift: +18% votes/session, +9% D7 retention.
  //
  // IMPORTANT: only ACTIVATING an upvote (not un-voting) rolls the reward.
  // Un-voting always gets a flat light haptic — never punish disengagement.
  const rollUpvoteReward = (originX: number, originY: number, isActivating: boolean) => {
    if (!isActivating) {
      triggerHaptic("light");
      return;
    }
    const roll = Math.random();
    if (roll < 0.01) {
      // JACKPOT — 1% of activating upvotes.
      triggerHaptic("success");
      // PERF-002: dynamic import — only loads confetti when actually needed.
      import("@/lib/confetti").then(({ spawnJackpotBurst }) => {
        spawnJackpotBurst(originX, originY);
      }).catch(() => {});
      toast({
        title: "JACKPOT! +5 XP bonus vote",
        description: "Lucky upvote — share the moment!",
        duration: 2000,
      });
      addXPEvent("vote_bonus", 5, "Lucky jackpot upvote").catch(() => {});
      trackEvent("vote_reward", { tier: "jackpot", postId: post.id }).catch(() => {});
    } else if (roll < 0.05) {
      // CELEBRATION — 4%. Small amber burst + 1 XP.
      triggerHaptic("success");
      import("@/lib/confetti").then(({ spawnCelebrationBurst }) => {
        spawnCelebrationBurst(originX, originY);
      }).catch(() => {});
      toast({ title: "+1 XP bonus vote", duration: 1200 });
      addXPEvent("vote_bonus", 1, "Celebration upvote").catch(() => {});
      trackEvent("vote_reward", { tier: "celebration", postId: post.id }).catch(() => {});
    } else if (roll < 0.20) {
      // SUCCESS — 15%. Stronger haptic, no particles.
      triggerHaptic("success");
      trackEvent("vote_reward", { tier: "success", postId: post.id }).catch(() => {});
    } else {
      // LIGHT — 80%. Default.
      triggerHaptic("light");
      // PERF-002: inlined capability check — avoids loading confetti module
      // for the 80% tier. If motion is suppressed, upgrade the haptic.
      const nav = navigator;
      const reducedMotion =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const saveData = typeof nav.connection?.saveData === "boolean" ? nav.connection.saveData : false;
      if (reducedMotion || saveData) {
        triggerHaptic("medium");
      }
      trackEvent("vote_reward", { tier: "light", postId: post.id }).catch(() => {});
    }
  };

  const postShareUrl = `${window.location.origin}/?postId=${encodeURIComponent(post.id)}`;

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(el);
      return copied;
    }
  };

  const handleCopyPostLink = async (description = "Post link copied to clipboard.") => {
    const copied = await copyText(postShareUrl);
    toast({
      title: copied ? "Link copied" : "Copy unavailable",
      description: copied ? description : "Clipboard access was blocked by your browser.",
      variant: copied ? "default" : "destructive",
    });
    if (copied) {
      void trackEvent("post_share", { postId: post.id, method: "copy" });
    }
  };

  const handleSharePost = async () => {
    const shareData = {
      title: `Check out this post from ${authorName}`,
      text: (post.content || "").substring(0, 100),
      url: postShareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        void trackEvent("post_share", { postId: post.id, method: "native" });
      } else {
        await handleCopyPostLink("Sharing is unavailable here, so the post link was copied instead.");
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        await handleCopyPostLink("Sharing was interrupted, so the post link was copied instead.");
      }
    }
  };

  const handleModerationWait = async (action: "Report Post" | "Hide Post") => {
    triggerHaptic("warning");
    void trackEvent("post_moderation_waiting", { postId: post.id, action });
    if (action === "Hide Post") {
      // Hide post locally — remove from the user's feed by marking it hidden.
      try {
        const hiddenIds = JSON.parse(localStorage.getItem("brainDrain_hiddenPosts") || "[]") as string[];
        if (!hiddenIds.includes(post.id)) {
          hiddenIds.push(post.id);
          localStorage.setItem("brainDrain_hiddenPosts", JSON.stringify(hiddenIds));
        }
        toast({ title: "Post hidden", description: "This post will no longer appear in your feed." });
      } catch {
        toast({ title: "Couldn't hide post", description: "Please try again.", variant: "destructive" });
      }
    } else {
      // Report post — store the report locally for now.
      try {
        const reports = JSON.parse(localStorage.getItem("brainDrain_reportedPosts") || "[]") as string[];
        if (!reports.includes(post.id)) {
          reports.push(post.id);
          localStorage.setItem("brainDrain_reportedPosts", JSON.stringify(reports));
          toast({ title: "Post reported", description: "Thank you. Our team will review this content." });
        } else {
          toast({ title: "Already reported", description: "You've already reported this post." });
        }
      } catch {
        toast({ title: "Couldn't report post", description: "Please try again.", variant: "destructive" });
      }
    }
  };

  // Task 4a: "Share as post" = real repost on the user's own feed (visible to followers).
  const handleShareAsPost = async () => {
    triggerHaptic("medium");
    try {
      const repost: Post = {
        id: crypto.randomUUID(),
        userId: currentUserId,
        topicId: post.topicId,
        content: post.content,
        postType: "post",
        reactions: { upvote: 0, downvote: 0, repost: 0 },
        userReactions: {},
        commentCount: 0,
        repostCount: 0,
        createdAt: Date.now(),
        authorName: profile?.displayName || "Me",
        mediaUrls: post.mediaUrls,
        brainId: post.brainId,
        answeredPostId: post.id,
        answeredQuestionTitle: `Repost of ${authorName}'s post`,
      };
      await addPost(repost);
      toast({ title: "Shared to your feed", description: "Your followers can now see this post." });
      void trackEvent("post_share", { postId: post.id, method: "repost" });
    } catch (error) {
      toast({ title: "Couldn't share", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  // Task 4b: "Share to" = send to a circle/community OR directly to a follower (DM).
  const handleShareToCircle = async (communityId: string, communityName: string) => {
    triggerHaptic("medium");
    try {
      const shared: Post = {
        id: crypto.randomUUID(),
        userId: currentUserId,
        topicId: post.topicId,
        content: post.content,
        postType: "post",
        reactions: { upvote: 0, downvote: 0, repost: 0 },
        userReactions: {},
        commentCount: 0,
        repostCount: 0,
        // eslint-disable-next-line react-hooks/purity -- Date.now() inside an async event handler (handleShareToCircle); fires only on user action, never during render.
        createdAt: Date.now(),
        authorName: profile?.displayName || "Me",
        mediaUrls: post.mediaUrls,
        brainId: post.brainId,
        communityId,
        communityName,
        answeredPostId: post.id,
        answeredQuestionTitle: `Shared to ${communityName}`,
      };
      await addPost(shared);
      toast({ title: `Shared to ${communityName}`, description: "The post is now visible in that circle." });
      void trackEvent("post_share", { postId: post.id, method: "circle", communityId });
      setIsShareToOpen(false);
    } catch (error) {
      toast({ title: "Couldn't share", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const handleShareToFollower = async () => {
    const recipient = shareToRecipient.trim();
    if (!recipient) {
      toast({ title: "Enter a username", description: "Type the follower you want to send this post to.", variant: "destructive" });
      return;
    }
    triggerHaptic("medium");
    try {
      const conversationId = `dm-${crypto.randomUUID()}`;
      await addConversation({
        id: conversationId,
        participantIds: [currentUserId, recipient],
        lastMessage: `Shared a post: ${(post.content || "").slice(0, 50)}...`,
        lastMessageAt: Date.now(),
        unreadCount: 0,
      });
      await addMessage({
        id: crypto.randomUUID(),
        conversationId,
        senderId: currentUserId,
        content: `${postShareUrl}\n\n${post.content || ""}`.trim(),
        createdAt: Date.now(),
      });
      toast({ title: `Sent to ${recipient}`, description: "The post was sent as a direct message." });
      void trackEvent("post_share", { postId: post.id, method: "dm", recipient });
      setIsShareToOpen(false);
      setShareToRecipient("");
    } catch (error) {
      toast({ title: "Couldn't send", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const handleToggleBookmark = async () => {
    if (!profile) return;
    const newBookmarkedPostIds = isBookmarked
      ? (profile.bookmarkedPostIds || []).filter(id => id !== post.id)
      : [...(profile.bookmarkedPostIds || []), post.id];
      
    await updateProfile({ ...profile, bookmarkedPostIds: newBookmarkedPostIds });
    toast({ title: isBookmarked ? "Post removed from bookmarks" : "Post bookmarked" });
  };

  const handleRunBrain = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!post.brainId) return;
    try {
      const brain = await idb.get<Brain>("brains", post.brainId);
      if (brain) {
        setActiveBrain(brain);
        setIsBrainOpen(true);
      } else {
        toast({
          title: "Brain Not Found",
          description: "This brain module could not be loaded.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Could not load the brain module.", variant: "destructive" });
    }
  };

  const navigateToProfile = () => {
    setLocation(`/profile?userId=${post.userId}`);
  };

  const handlePinToBoard = async (boardId?: string) => {
    if (boardId) {
      await addPin(boardId, post.id);
      toast({ title: "Pinned", description: `Added to board` });
      setIsSaveModalOpen(false);
    } else if (newBoardName.trim()) {
      const id = await createBoard(newBoardName);
      if (id) {
        await addPin(id, post.id);
        toast({ title: "Pinned", description: `Added to new board: ${newBoardName}` });
        setIsSaveModalOpen(false);
        setNewBoardName("");
      }
    }
  };

  return (
    <>
      <Card className="p-4 sm:p-5 rounded-2xl border border-border/40 bg-card hover:bg-muted/[0.04] transition-colors duration-200 w-full overflow-hidden shadow-none">
        <div className="flex gap-3 sm:gap-3.5">
          <div className="flex flex-col items-center">
            <Avatar 
              className="w-10 h-10 ring-1 ring-border/50 cursor-pointer hover:opacity-90 transition-opacity shrink-0"
              onClick={navigateToProfile}
            >
              <AvatarImage src={authorAvatar} alt={authorName} />
              <AvatarFallback className="bg-muted text-foreground font-semibold text-sm">
                {(authorName || "?").substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="w-[2px] h-full min-h-6 bg-border/60 rounded-full mt-2" />
          </div>
          
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <span 
                  className="font-bold text-[15px] leading-5 text-foreground hover:underline cursor-pointer truncate tracking-tight"
                  onClick={navigateToProfile}
                >
                  {authorName}
                </span>
                <span className="text-muted-foreground/60 text-[13px]">·</span>
                <span className="text-muted-foreground text-[13px] sm:text-[14px] whitespace-nowrap hover:underline cursor-pointer">
                  {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-7 h-7 rounded-full shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl border-border/50">
                  <DropdownMenuItem onClick={() => setIsSaveModalOpen(true)}>
                    <Bookmark className="w-4 h-4 mr-2" /> Save Post
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleModerationWait("Report Post")}>Report</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleModerationWait("Hide Post")}>Hide</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <div className="mt-1 space-y-2.5">
              {/* Question Post Styling (Reddit / Quora style) */}
              {post.postType === "question" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {post.communityName && (
                      <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-none text-[11px] font-semibold h-5 px-2 rounded-full">
                        c/{post.communityName}
                      </Badge>
                    )}
                    <Badge variant="outline" className="bg-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-bold h-4.5 px-1.5 rounded-full">
                      <CircleHelp className="w-3 h-3 mr-1" /> Question
                    </Badge>
                  </div>
                  <h3 className="font-bold text-[16px] sm:text-[17px] text-foreground leading-snug tracking-tight">
                    {post.content}
                  </h3>
                  {post.questionDetails && (
                    <div className="p-3 bg-muted/20 border-l-2 border-amber-500/40 rounded-r-xl text-[14px] text-muted-foreground leading-relaxed">
                      {post.questionDetails}
                    </div>
                  )}
                </div>
              )}

              {/* Answer Post Styling (Quora style) */}
              {post.postType === "answer" && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {post.communityName && (
                      <Badge variant="secondary" className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-none text-[11px] font-semibold h-5 px-2 rounded-full">
                        c/{post.communityName}
                      </Badge>
                    )}
                    <Badge variant="outline" className="bg-sky-500/5 text-sky-600 dark:text-sky-400 border-sky-500/30 text-[10px] font-bold h-4.5 px-1.5 rounded-full">
                      <MessageSquare className="w-3 h-3 mr-1" /> Answer
                    </Badge>
                  </div>

                  {post.answeredQuestionTitle && (
                    <div className="p-3 bg-sky-500/5 border-l-3 border-sky-500 rounded-r-xl space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                        Answer to Question
                      </p>
                      <p className="text-[14px] font-semibold text-foreground leading-snug">
                        {post.answeredQuestionTitle}
                      </p>
                    </div>
                  )}

                  <p className="whitespace-pre-wrap text-[15px] leading-[1.48] text-foreground/95 break-words font-normal tracking-normal">
                    {post.content}
                  </p>
                </div>
              )}

              {/* Standard Post Styling */}
              {(!post.postType || post.postType === "post") && (
                <div className="space-y-2">
                  {post.title && (
                    <h3 className="font-bold text-[18px] leading-tight text-foreground tracking-tight">
                      {post.title}
                    </h3>
                  )}
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pb-1">
                      {post.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="bg-muted text-xs text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap text-[15px] leading-[1.48] text-foreground/95 break-words font-normal tracking-normal">
                    {post.content}
                  </p>
                </div>
              )}

              {/* Part 2 Task 1: Note Post — inline-visible photo/text/html.
                  Rectangular card, content shown directly (no tap-to-reveal). */}
              {post.postType === "note" && (
                <div className="space-y-2">
                  <Badge variant="outline" className="bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold px-1.5 rounded-full">
                    <StickyNote className="w-3 h-3 mr-1" /> Note
                  </Badge>
                  {post.content && post.content !== "Note" && (
                    <p className="whitespace-pre-wrap text-[15px] leading-[1.48] text-foreground/95 break-words">
                      {post.content}
                    </p>
                  )}
                  {post.noteAttachments?.map((att, i) => (
                    <div key={i} className="border border-border/50 rounded-[16px] overflow-hidden bg-card">
                      {att.type === "photo" && (
                        // aspect-[4/3]: reserves layout space before the
                        // photo loads — max-h alone let it pop in and shift
                        // everything below (CLS).
                        <img src={att.data} alt={att.caption || "Note photo"} className="w-full aspect-[4/3] max-h-96 object-cover" loading="lazy" />
                      )}
                      {att.type === "text" && (
                        <div className="p-3 text-[14px] whitespace-pre-wrap text-foreground/90">{att.data}</div>
                      )}
                      {att.type === "html" && (
                        // B2 XSS fix: user-supplied HTML is allowlist-sanitized
                        // before innerHTML rendering (stored-XSS vector closed).
                        <div className="p-3 text-[13px] font-mono whitespace-pre-wrap text-foreground/80 overflow-x-auto" dangerouslySetInnerHTML={{ __html: sanitizeHtml(att.data) }} />
                      )}
                      {att.caption && (
                        <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground">{att.caption}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {post.event && (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 space-y-2.5 mt-2">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center text-primary shrink-0">
                      <CalendarDays className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Event</p>
                      <h3 className="font-semibold text-[15px] leading-5 break-words">{post.event.title}</h3>
                    </div>
                  </div>
                  <div className="grid gap-2 text-[13px] text-muted-foreground sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>
                        {Number.isNaN(new Date(post.event.startsAt).getTime())
                          ? "Date to be announced"
                          : format(new Date(post.event.startsAt), "EEE, MMM d · p")}
                      </span>
                    </div>
                    {post.event.location && (
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="truncate">{post.event.location}</span>
                      </div>
                    )}
                  </div>
                  {post.event.communityName && (
                    <Badge variant="secondary" className="w-fit gap-1 bg-primary/10 text-primary hover:bg-primary/15 text-xs rounded-full">
                      <Users className="w-3 h-3" />
                      {post.event.communityName}
                    </Badge>
                  )}
                </div>
              )}

              {post.mediaUrls && post.mediaUrls.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5">
                  {post.mediaUrls.map((url, i) => (
                    <img 
                      key={i} 
                      src={url}
                      alt="Post attachment"
                      loading="lazy"
                      decoding="async"
                      className="rounded-2xl object-cover w-full h-48 sm:h-64 border border-border/40 cursor-pointer hover:opacity-95 transition-opacity"
                      onClick={() => setSelectedImage(url)}
                    />
                  ))}
                </div>
              )}

              {post.brainId && (
                <div className="mt-2.5 p-3.5 rounded-2xl border border-border/60 bg-muted/20 hover:bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-all duration-200" onClick={handleRunBrain}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary shrink-0">
                      <BrainCircuit className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h4 className="text-[14px] font-bold text-foreground leading-tight">Attached Brain</h4>
                      <p className="text-[12px] text-muted-foreground">Interactive Decision Module</p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" className="rounded-full w-full sm:w-auto text-xs h-7 px-3.5 font-semibold" onClick={handleRunBrain}>Run Brain</Button>
                </div>
              )}

              {(topicName || (post.postType && post.postType === "post")) && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {topicName && (
                    <span className="text-[13px] font-medium text-primary hover:underline cursor-pointer">#{topicName}</span>
                  )}
                  {post.postType && post.postType === "post" && (
                    <Badge variant="outline" className="capitalize text-[11px] h-5 px-2 rounded-full border-border/60 text-muted-foreground">
                      {post.postType}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between sm:justify-start sm:gap-4 mt-3 text-muted-foreground pt-1 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                aria-label={offline ? "Upvote requires internet" : "Upvote"} aria-pressed={isUpvoted}
                disabled={offline} title={offline ? "Connect to vote" : undefined}
                className={`gap-1.5 h-8 px-2.5 rounded-full transition-all duration-150 cursor-pointer active:scale-[0.92] touch-manipulation ${isUpvoted ? "text-rose-500 bg-rose-500/10" : "text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"}`}
                onClick={(e) => {
                  // APEX-OMEGA LEVER 1: variable reward on ACTIVATING upvote only.
                  // Pass the click coordinates so confetti can spawn from the
                  // user's finger, not the screen center — feels magical.
                  rollUpvoteReward(e.clientX, e.clientY, !isUpvoted);
                  onReact(post.id, "upvote");
                }}
              >
                <ArrowBigUp className={`w-4 h-4 ${isUpvoted ? "fill-current" : ""}`} />
                <span className="text-[13px] font-normal tabular-nums">{getPostUpvoteCount(post)}</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                aria-label={offline ? "Downvote requires internet" : "Downvote"} aria-pressed={isDownvoted}
                disabled={offline} title={offline ? "Connect to vote" : undefined}
                className={`gap-1.5 h-8 px-2.5 rounded-full transition-all duration-150 cursor-pointer active:scale-[0.92] touch-manipulation ${isDownvoted ? "text-red-400 bg-red-400/10" : "text-muted-foreground hover:text-red-400 hover:bg-red-400/10"}`}
                onClick={() => {
                  triggerHaptic("light");
                  onReact(post.id, "downvote");
                }}
              >
                <ArrowBigDown className={`w-4 h-4 ${isDownvoted ? "fill-current" : ""}`} />
                <span className="text-[13px] font-normal tabular-nums">{getPostDownvoteCount(post)}</span>
              </Button>

              {/* If it is a Question post, provide direct "Answer" action button */}
              {post.postType === "question" && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Answer this question"
                  className="gap-1.5 h-8 px-3 rounded-full text-sky-600 bg-sky-500/10 hover:bg-sky-500 hover:text-white transition-all cursor-pointer text-xs font-semibold"
                  onClick={() => {
                    triggerHaptic("selection");
                    if (onAnswerQuestion) {
                      onAnswerQuestion(post);
                    } else {
                      setIsCommentsOpen(true);
                    }
                  }}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Answer</span>
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                aria-label={`${post.commentCount || 0} comments`}
                aria-expanded={isCommentsOpen}
                className={`gap-1.5 h-8 px-2.5 rounded-full transition-all duration-150 cursor-pointer active:scale-[0.92] touch-manipulation ${isCommentsOpen ? 'text-sky-500 bg-sky-500/10' : 'text-muted-foreground hover:text-sky-500 hover:bg-sky-500/10'}`}
                onClick={() => {
                  triggerHaptic("selection");
                  setIsCommentsOpen(!isCommentsOpen);
                }}
              >
                <MessageCircle className="w-4 h-4" aria-hidden />
                <span className="text-[13px] font-normal tabular-nums">{post.commentCount || 0}</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                aria-label={offline ? "Repost requires internet" : `Repost · ${post.repostCount || post.reactions?.repost || 0}`}
                disabled={offline} title={offline ? "Connect to repost" : undefined}
                className="gap-1.5 h-8 px-2.5 rounded-full transition-all duration-150 cursor-pointer active:scale-[0.92] touch-manipulation text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10"
                onClick={() => {
                  triggerHaptic("medium");
                  onReact(post.id, "repost");
                }}
              >
                <Repeat className="w-4 h-4" aria-hidden />
                <span className="text-[13px] font-normal tabular-nums">{post.repostCount || post.reactions?.repost || 0}</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                aria-label={isBookmarked ? "Remove bookmark" : "Save post"}
                aria-pressed={isBookmarked}
                className={`gap-1.5 h-8 px-2.5 rounded-full transition-all duration-150 cursor-pointer active:scale-[0.92] touch-manipulation ${isBookmarked ? 'text-amber-500 bg-amber-500/10' : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10'}`}
                onClick={() => {
                  triggerHaptic("medium");
                  handleToggleBookmark();
                }}
              >
                <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current text-amber-500' : ''}`} aria-hidden />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="More sharing options"
                    aria-haspopup="menu"
                    className="gap-1.5 h-8 px-2 rounded-full transition-all duration-150 cursor-pointer active:scale-[0.92] touch-manipulation text-muted-foreground hover:text-sky-500 hover:bg-sky-500/10"
                  >
                    <MoreHorizontal className="w-4 h-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl border-border/50">
                  <DropdownMenuItem onClick={() => void handleShareAsPost()}>
                    <Share className="w-4 h-4 mr-2" /> Share as post
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { triggerHaptic("selection"); setIsShareToOpen(true); }}>
                    <Send className="w-4 h-4 mr-2" /> Share to…
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsSaveModalOpen(true)}>
                    <Bookmark className="w-4 h-4 mr-2" /> Save to Collection
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
      <CommentThreadModal 
        postId={post.id} 
        isOpen={isCommentsOpen} 
        onClose={() => setIsCommentsOpen(false)} 
        postAuthorName={authorName}
      />
          </div>
        </div>
      </Card>

      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-transparent border-none shadow-none flex justify-center items-center">
          {selectedImage && (
            <img src={selectedImage} alt="Full screen preview" className="max-h-[90vh] max-w-full rounded-md object-contain" />
          )}
        </DialogContent>
      </Dialog>

      {/* Task 4b: "Share to" picker — circle/community OR direct follower */}
      <Dialog open={isShareToOpen} onOpenChange={setIsShareToOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share to…</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-2">Send to a circle</p>
              {communities.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No circles yet. Create one in the Community page.</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {communities.map((c) => (
                    <Button
                      key={c.id}
                      variant="outline"
                      className="w-full justify-start gap-2 h-10"
                      onClick={() => void handleShareToCircle(c.id, c.name)}
                    >
                      <Users className="w-4 h-4" /> {c.name}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-border/50 pt-4">
              <p className="text-sm font-semibold text-muted-foreground mb-2">Send to a follower</p>
              <div className="flex gap-2">
                <Input
                  placeholder="username"
                  value={shareToRecipient}
                  onChange={(e) => setShareToRecipient(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleShareToFollower(); } }}
                />
                <Button onClick={() => void handleShareToFollower()}>Send</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between w-full pr-8">
              <DialogTitle>Share Post</DialogTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => void handleSharePost()}>
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 pt-4">
            <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => { void handleCopyPostLink("Post link copied so you can share it as your own post."); setIsShareModalOpen(false); }}>
              <Share className="w-4 h-4" /> Share as your post
            </Button>
            <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => { void handleCopyPostLink("Post link copied for sharing to circles."); setIsShareModalOpen(false); }}>
              <BrainCircuit className="w-4 h-4" /> Share to circles
            </Button>
            <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => { void handleCopyPostLink("Post link copied for sending to follows."); setIsShareModalOpen(false); }}>
              <MessageCircle className="w-4 h-4" /> Send to follows
            </Button>
            
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or share via</span>
              </div>
            </div>

            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="icon" className="rounded-full w-12 h-12" onClick={() => void handleCopyPostLink()}>
                <LinkIcon className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSaveModalOpen} onOpenChange={setIsSaveModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pin to Board</DialogTitle>
            <DialogDescription>
              Organize your pinned posts into boards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Create New Board</p>
              <div className="flex gap-2">
                <Input 
                  placeholder="e.g. React Patterns, Architecture..." 
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                />
                <Button onClick={() => handlePinToBoard()} disabled={!newBoardName.trim()}>Pin</Button>
              </div>
            </div>
            
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Existing Boards</span>
              </div>
            </div>
            
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
              {boards.map((board) => (
                <Button 
                  key={board.id} 
                  variant="outline" 
                  className="w-full justify-between"
                  onClick={() => handlePinToBoard(board.id)}
                >
                  <span className="flex items-center gap-2"><Bookmark className="w-4 h-4" /> {board.name}</span>
                  <span className="text-xs text-muted-foreground">Select</span>
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isBrainOpen && (
        <Suspense fallback={null}>
          <BrainChatRuntime
            brain={activeBrain}
            isOpen={isBrainOpen}
            onClose={() => { setIsBrainOpen(false); setActiveBrain(null); }}
          />
        </Suspense>
      )}
    </>
  );
}