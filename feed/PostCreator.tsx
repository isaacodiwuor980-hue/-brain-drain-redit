import { lazy, Suspense, useEffect, useRef, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarPlus,
  Image as ImageIcon,
  BrainCircuit,
  Hash,
  Plus,
  X,
  CircleHelp,
  MessageSquare,
  PenSquare,
  Search,
  ArrowLeft,
  Info,
  Users,
  MessageCircle,
  Lock,
  StickyNote,
  Code,
  FileText,
} from "lucide-react";
import { BrainData, Post, PostEvent, PostType, NoteAttachment } from "@/lib/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { idb } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic } from "@/lib/device";
import { useAuth } from "@/components/auth/AuthContext";
import { userIdOr, displayNameOr } from "@/lib/user-data";

const WizardModal = lazy(() =>
  import("@/components/WizardModal").then((module) => ({ default: module.WizardModal })),
);

export interface CommunityOption {
  id: string;
  name: string;
}

export interface QuestionTarget {
  id: string;
  title: string;
  details?: string;
  authorName?: string;
  authorAvatar?: string;
  communityId?: string;
  communityName?: string;
  topicId?: string;
  topicName?: string;
  createdAt?: number;
  answerCount?: number;
}

interface PostCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated: (post: Post) => Promise<void>;
  topics: { id: string; name: string }[];
  communities?: CommunityOption[];
  postType?: PostType;
  existingQuestions?: QuestionTarget[];
  initialSelectedQuestion?: QuestionTarget | null;
}

// Default community questions inspired by Quora and Reddit communities
const DEFAULT_COMMUNITY_QUESTIONS: QuestionTarget[] = [
  {
    id: "q-react-state",
    title: "How do you structure complex state transitions in large-scale React apps without over-engineering?",
    details: "Looking for practical mental models on when to use reducer patterns, directed graphs, vs standard local hooks.",
    authorName: "Alex Rivera",
    communityName: "React / Frontend",
    topicName: "React",
    topicId: "t3",
    createdAt: Date.now() - 7200000,
    answerCount: 4,
  },
  {
    id: "q-diag-tree",
    title: "What is the best mental model for distinguishing between correlation and causation in complex diagnostic trees?",
    details: "In diagnostic scenarios where multiple symptoms co-occur with confounding factors, how do you verify causal pathways?",
    authorName: "Dr. Sarah Chen",
    communityName: "Medical Diagnosis",
    topicName: "Philosophy",
    topicId: "t2",
    createdAt: Date.now() - 14400000,
    answerCount: 2,
  },
  {
    id: "q-ai-safety",
    title: "What are the most common failure modes when deploying multi-agent decision systems into production?",
    details: "Focusing on feedback loops, reward hacking, and cascading failure containment strategies.",
    authorName: "Elena Rostova",
    communityName: "AI Safety",
    topicName: "Engineering",
    topicId: "t1",
    createdAt: Date.now() - 28800000,
    answerCount: 6,
  },
  {
    id: "q-philosophy-eval",
    title: "If a decision brain encodes heuristics from multiple experts with conflicting approaches, how should tie-breaking be modeled?",
    details: "Comparing Bayesian updating, weighted epistemic confidence scores, and minimax regret models.",
    authorName: "Marcus Vance",
    communityName: "Philosophy",
    topicName: "Philosophy",
    topicId: "t2",
    createdAt: Date.now() - 43200000,
    answerCount: 1,
  },
  {
    id: "q-game-branching",
    title: "How do narrative game designers prevent combinatorial explosion in deeply branching choice graphs?",
    details: "Techniques for converging nodes, state tracking flags, and emotional illusion of choice without infinite work.",
    authorName: "Kai Takahashi",
    communityName: "Game Dev",
    topicName: "Engineering",
    topicId: "t1",
    createdAt: Date.now() - 86400000,
    answerCount: 3,
  },
];

export function PostCreator({
  isOpen,
  onClose,
  onPostCreated,
  topics,
  communities = [],
  postType: initialPostType = "post",
  existingQuestions = [],
  initialSelectedQuestion = null,
}: PostCreatorProps) {
  // Phase 2: real user identity. Falls back to "me" / "Me" for guest mode
  // so the app still works locally without sign-in.
  const { user } = useAuth();
  const currentUserId = userIdOr(user);
  const currentDisplayName = displayNameOr(user);

  const [postType, setPostType] = useState<PostType>(initialPostType);
  const [content, setContent] = useState("");
  // Submit guard — prevents duplicate posts when the user rapid-clicks
  // the Publish button before the dialog closes. The button is async
  // (creates the post, calls onPostCreated, then handleClose); without
  // this guard, a double-click creates two identical posts.
  const [isPublishing, setIsPublishing] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postTags, setPostTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [questionDetails, setQuestionDetails] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [selectedCommunityId, setSelectedCommunityId] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [attachedBrainId, setAttachedBrainId] = useState<string | null>(null);
  // Edit policy — who can edit this post after it's published.
  // Default "me-only" is the safest choice; the author can always edit
  // their own post regardless. See Post.editPolicy in lib/types.ts.
  const [editPolicy, setEditPolicy] = useState<"public" | "verified-experts" | "me-only">("me-only");

  // B: Suggest existing tags from recent posts (loaded from IDB on mount).
  const [recentTags, setRecentTags] = useState<string[]>([]);

  // For answering questions
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionTarget | null>(initialSelectedQuestion);
  const [questionSearchQuery, setQuestionSearchQuery] = useState("");
  const [filterCommunity, setFilterCommunity] = useState<string>("all");

  // For event post
  const [isEventMode, setIsEventMode] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventLocation, setEventLocation] = useState("");

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Part 2 Task 1: Note attachments (photo/text/html) — inline-visible in feed.
  const [noteAttachments, setNoteAttachments] = useState<NoteAttachment[]>([]);
  const notePhotoInputRef = useRef<HTMLInputElement>(null);
  const addNoteAttachment = (type: "text" | "html") => {
    setNoteAttachments((prev) => [...prev, { type, data: "", caption: "" }]);
  };

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate modal-open sync of the initialPostType prop + persisted draft storage into editable form state; refactoring to derived state would break draft restore + user editability.
      setPostType(initialPostType);
      if (initialSelectedQuestion) {
        setSelectedQuestion(initialSelectedQuestion);
      }

      // Load drafts. localStorage may be unavailable (private mode /
      // sandboxed iframes) — guard with try/catch so the dialog still opens.
      try {
        const savedDraft = localStorage.getItem("postCreatorDraft");
        if (savedDraft) {
          const draft = JSON.parse(savedDraft);
          if (draft.postTitle) setPostTitle(draft.postTitle);
          if (draft.content) setContent(draft.content);
          if (draft.postTags) setPostTags(draft.postTags);
          if (draft.questionDetails) setQuestionDetails(draft.questionDetails);
          if (draft.postType) setPostType(draft.postType);
          if (draft.isEventMode) setIsEventMode(draft.isEventMode);
          if (draft.eventTitle) setEventTitle(draft.eventTitle);
          if (draft.eventDate) setEventDate(draft.eventDate);
          if (draft.eventTime) setEventTime(draft.eventTime);
          if (draft.eventLocation) setEventLocation(draft.eventLocation);
        }
      } catch {
        // Draft restore is best-effort — ignore parse / quota / access errors.
      }
    }
  }, [initialPostType, initialSelectedQuestion, isOpen]);

  // B: Load recent tags from IDB on mount (suggests existing tags instead of
  // requiring users to invent new ones).
  useEffect(() => {
    const loadTags = async () => {
      try {
        const allPosts = await idb.getAll<Post>("posts");
        const tagCount = new Map<string, number>();
        for (const p of allPosts) {
          if (p.tags) for (const t of p.tags) {
            tagCount.set(t, (tagCount.get(t) || 0) + 1);
          }
        }
        // Sort by frequency, take top 10.
        setRecentTags(Array.from(tagCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t));
      } catch { /* best-effort */ }
    };
    if (isOpen) void loadTags();
  }, [isOpen]);

  // Auto-save draft whenever inputs change. Guarded against blocked storage.
  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("postCreatorDraft", JSON.stringify({
          postTitle,
          content,
          postTags,
          questionDetails,
          postType,
          isEventMode,
          eventTitle,
          eventDate,
          eventTime,
          eventLocation
        }));
      } catch {
        // Best-effort: ignore quota / private-mode write errors.
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [postTitle, content, postTags, questionDetails, postType, isEventMode, eventTitle, eventDate, eventTime, eventLocation, isOpen]);

  // Combine provided existing questions with curated community questions
  const allAvailableQuestions = useMemo(() => {
    const combined: QuestionTarget[] = [...existingQuestions];
    const existingIds = new Set(combined.map((q) => q.id));

    DEFAULT_COMMUNITY_QUESTIONS.forEach((q) => {
      if (!existingIds.has(q.id)) {
        combined.push(q);
      }
    });

    return combined;
  }, [existingQuestions]);

  // Filter questions for the "Answer" browse stage
  const filteredQuestions = useMemo(() => {
    return allAvailableQuestions.filter((q) => {
      const matchesSearch =
        !questionSearchQuery.trim() ||
        (q.title || "").toLowerCase().includes((questionSearchQuery || "").toLowerCase()) ||
        (q.details && q.details.toLowerCase().includes((questionSearchQuery || "").toLowerCase())) ||
        (q.communityName && q.communityName.toLowerCase().includes((questionSearchQuery || "").toLowerCase()));

      const matchesCommunity =
        filterCommunity === "all" ||
        (q.communityName && q.communityName.toLowerCase().includes(filterCommunity.toLowerCase())) ||
        (q.communityId && q.communityId === filterCommunity);

      return matchesSearch && matchesCommunity;
    });
  }, [allAvailableQuestions, questionSearchQuery, filterCommunity]);

  const reset = () => {
    setContent("");
    setPostTitle("");
    setPostTags([]);
    setTagInput("");
    setQuestionDetails("");
    setSelectedTopicId("");
    setSelectedCommunityId("");
    setPostType("post");
    setMediaUrls([]);
    setAttachedBrainId(null);
    setSelectedQuestion(null);
    setQuestionSearchQuery("");
    setFilterCommunity("all");
    setIsEventMode(false);
    setEventTitle("");
    setEventDate("");
    setEventTime("");
    setEventLocation("");
    try { localStorage.removeItem("postCreatorDraft"); } catch { /* best-effort */ }
  };

  const handleClose = () => {
    // B: Warn before discarding unsaved work.
    const hasUnsavedContent = content.trim() || postTitle.trim() || postTags.length > 0 || questionDetails.trim();
    if (hasUnsavedContent && !isPublishing) {
      // Auto-save draft before closing (existing localStorage draft logic
      // already persists on every change, so the draft IS saved). Just show
      // a toast so the user knows their draft is preserved.
      toast({ title: "Draft saved", description: "Your draft will be here next time you open the composer.", duration: 2000 });
    }
    setIsWizardOpen(false);
    setIsPublishing(false); // reset the submit guard for the next open
    reset();
    onClose();
  };

  const buildEvent = (): PostEvent | undefined | null => {
    if (!isEventMode) return undefined;

    if (!eventTitle.trim() || !eventDate || !eventTime) {
      toast({
        title: "Complete the event details",
        description: "Add an event title, date, and start time before publishing.",
        variant: "destructive",
      });
      return null;
    }

    const startsAt = new Date(`${eventDate}T${eventTime}`).getTime();
    if (Number.isNaN(startsAt)) {
      toast({
        title: "Invalid event date",
        description: "Choose a valid date and start time for the event.",
        variant: "destructive",
      });
      return null;
    }

    const community = communities.find((item) => item.id === selectedCommunityId);
    return {
      title: eventTitle.trim(),
      startsAt,
      location: eventLocation.trim() || undefined,
      communityId: community?.id,
      communityName: community?.name,
    };
  };

  const submitPost = async (post: Post) => {
    setIsPublishing(true);
    try {
      await onPostCreated(post);
      setIsWizardOpen(false);
      reset();
      onClose();
      toast({ title: "Saved on this device", description: "Publishing status may need review. Do not repost until it is confirmed." });
    } catch {
      toast({ title: "Could not save", description: "Keep this editor open and try again; storage may be unavailable.", variant: "destructive" });
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublish = () => {
    // Submit guard — prevents duplicate posts on rapid double-click.
    // The button is disabled while isPublishing is true, but this guard
    // also catches programmatic calls and keyboard Enter spam.
    if (isPublishing) return;
    const trimmedContent = content.trim();

    if (postType === "question") {
      if (!trimmedContent) {
        toast({
          title: "Question is required",
          description: "Please enter your question before asking.",
          variant: "destructive",
        });
        return;
      }

      const community = communities.find((c) => c.id === selectedCommunityId);
      const newPost: Post = {
        id: crypto.randomUUID(),
        userId: currentUserId,
        authorName: currentDisplayName,
        topicId: selectedTopicId || topics[0]?.id || "general",
        content: trimmedContent,
        postType: "question",
        questionDetails: questionDetails.trim() || undefined,
        communityId: community?.id || undefined,
        communityName: community?.name || undefined,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        brainId: attachedBrainId || undefined,
        editPolicy,
        reactions: { upvote: 0, downvote: 0 },
        commentCount: 0,
        createdAt: Date.now(),
      };

      triggerHaptic("success");
      void submitPost(newPost);
      return;
    }

    if (postType === "answer") {
      if (!trimmedContent) {
        toast({
          title: "Answer content required",
          description: "Please write your answer before submitting.",
          variant: "destructive",
        });
        return;
      }

      const newPost: Post = {
        id: crypto.randomUUID(),
        userId: currentUserId,
        authorName: currentDisplayName,
        topicId: selectedQuestion?.topicId || selectedTopicId || topics[0]?.id || "general",
        content: trimmedContent,
        postType: "answer",
        answeredPostId: selectedQuestion?.id,
        answeredQuestionTitle: selectedQuestion?.title,
        answeredQuestionAuthor: selectedQuestion?.authorName,
        communityId: selectedQuestion?.communityId || undefined,
        communityName: selectedQuestion?.communityName || undefined,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        brainId: attachedBrainId || undefined,
        editPolicy,
        reactions: { upvote: 0, downvote: 0 },
        commentCount: 0,
        createdAt: Date.now(),
      };

      triggerHaptic("success");
      void submitPost(newPost);
      return;
    }

    // Part 2 Task 1: Note post type — requires at least one attachment.
    if (postType === "note") {
      const validAttachments = noteAttachments.filter((a) => a.data.trim() !== "");
      if (validAttachments.length === 0) {
        toast({
          title: "Note content required",
          description: "Add at least one photo, text, or HTML attachment.",
          variant: "destructive",
        });
        return;
      }
      const newPost: Post = {
        id: crypto.randomUUID(),
        userId: currentUserId,
        authorName: currentDisplayName,
        topicId: selectedTopicId || topics[0]?.id || "general",
        content: trimmedContent || "Note",
        postType: "note",
        noteAttachments: validAttachments,
        reactions: { upvote: 0, downvote: 0 },
        commentCount: 0,
        createdAt: Date.now(),
      };
      triggerHaptic("success");
      void submitPost(newPost);
      return;
    }

    // Standard Post Mode
    const event = buildEvent();
    if (isEventMode && !event) return;

    if (!trimmedContent && !isEventMode) {
      toast({
        title: "Post content required",
        description: "Please enter what is on your mind.",
        variant: "destructive",
      });
      return;
    }

    if (postTags.length > 10 || postTags.some(tag => !tag.trim() || tag.trim().length > 40)) {
      toast({ title: "Check your tags", description: "Use up to 10 tags, each no more than 40 characters.", variant: "destructive" });
      return;
    }
    const community = communities.find((c) => c.id === selectedCommunityId);
    const newPost: Post = {
      id: crypto.randomUUID(),
      userId: currentUserId,
      authorName: currentDisplayName,
      topicId: selectedTopicId || topics[0]?.id || "general",
      title: postTitle.trim() || undefined,
      tags: postTags.length > 0 ? postTags : undefined,
      content: trimmedContent || (event ? `Join us for ${event.title}.` : ""),
      postType: "post",
      ...(event ? { event } : {}),
      communityId: community?.id || undefined,
      communityName: community?.name || undefined,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      brainId: attachedBrainId || undefined,
      editPolicy,
      reactions: { upvote: 0, downvote: 0 },
      commentCount: 0,
      createdAt: Date.now(),
    };

    triggerHaptic("success");
    void submitPost(newPost);
  };

  const handleBrainSave = async (data: BrainData) => {
    try {
      await idb.put("brains", data.brain);
      for (const node of data.nodes) {
        await idb.put("nodes", node);
      }
      setAttachedBrainId(data.brain.id);
      setIsWizardOpen(false);
      toast({
        title: "Brain Attached",
        description: `"${data.brain.title}" is now attached to your submission.`,
      });
    } catch (error) {
      toast({
        title: "Couldn't attach brain",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    if (mediaUrls.length + files.length > 4) {
      toast({
        title: "Limit reached",
        description: "You can attach up to 4 images max.",
        variant: "destructive",
      });
      return;
    }

    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} is larger than 5MB.`,
          variant: "destructive",
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        if (loadEvent.target?.result) {
          setMediaUrls((previousUrls) => [...previousUrls, loadEvent.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });

    event.target.value = "";
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && !isPublishing && handleClose()}>
        <DialogContent
          id="q-and-a-post-creator-dialog"
          className="max-w-2xl max-h-[92vh] flex flex-col bg-card border-border/50 sm:rounded-[20px] p-0 overflow-hidden shadow-2xl"
        >
          {/* Top Quora/Reddit Segmented Navigation Bar */}
          <div className="border-b border-border/50 bg-muted/20 px-6 pt-4 pb-3">
            <div className="flex items-center justify-between gap-2 mb-3">
              <DialogTitle className="text-base sm:text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                {postType === "question" && (
                  <>
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      <CircleHelp className="w-4 h-4" />
                    </span>
                    Ask the Community
                  </>
                )}
                {postType === "answer" && (
                  <>
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
                      <MessageSquare className="w-4 h-4" />
                    </span>
                    Answer Questions
                  </>
                )}
                {postType === "post" && (
                  <>
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary">
                      <PenSquare className="w-4 h-4" />
                    </span>
                    Create a Post
                  </>
                )}
              </DialogTitle>
            </div>

            {/* Reddit/Quora style Switcher Tabs */}
            <div
              id="post-creator-tabs"
              className="grid grid-cols-4 gap-1 bg-muted/40 p-1 rounded-xl border border-border/40"
            >
              <button
                type="button"
                id="tab-create-post"
                onClick={() => {
                  triggerHaptic("selection");
                  setPostType("post");
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  postType === "post"
                    ? "bg-background text-foreground shadow-sm border border-border/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <PenSquare className="w-4 h-4 text-primary" />
                <span>Post</span>
              </button>

              <button
                type="button"
                id="tab-ask-question"
                onClick={() => {
                  triggerHaptic("selection");
                  setPostType("question");
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  postType === "question"
                    ? "bg-background text-foreground shadow-sm border border-border/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <CircleHelp className="w-4 h-4 text-amber-500" />
                <span>Question</span>
              </button>

              <button
                type="button"
                id="tab-answer-questions"
                onClick={() => {
                  triggerHaptic("selection");
                  setPostType("answer");
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  postType === "answer"
                    ? "bg-background text-foreground shadow-sm border border-border/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <MessageSquare className="w-4 h-4 text-sky-500" />
                <span>Answer</span>
              </button>

              {/* Part 2 Task 1: Note post type — inline-visible photo/text/html */}
              <button
                type="button"
                id="tab-create-note"
                onClick={() => {
                  triggerHaptic("selection");
                  setPostType("note");
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  postType === "note"
                    ? "bg-background text-foreground shadow-sm border border-border/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <StickyNote className="w-4 h-4 text-emerald-500" />
                <span>Note</span>
              </button>
            </div>
          </div>

          {/* Main Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* ======================================================== */}
            {/* 1. QUESTION FORMAT (Quora / Reddit Style)                 */}
            {/* ======================================================== */}
            {postType === "question" && (
              <div id="question-format-section" className="space-y-4 animate-in fade-in duration-200">
                {/* Quora-style Tips Box */}
                <div className="flex items-start gap-3 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-900 dark:text-amber-200">
                  <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Tips for getting insightful answers:</p>
                    <p className="text-amber-800/90 dark:text-amber-300/90">
                      Start with &ldquo;What&rdquo;, &ldquo;How&rdquo;, or &ldquo;Why&rdquo; • Make your question specific and clear • Add context or background details below.
                    </p>
                  </div>
                </div>

                {/* Target Community & Topic Selector (Reddit flair / subreddit style) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="question-community" className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Target Community
                    </Label>
                    <Select
                      value={selectedCommunityId || "general"}
                      onValueChange={(val) => setSelectedCommunityId(val === "general" ? "" : val)}
                    >
                      <SelectTrigger id="question-community" className="h-9 text-xs rounded-xl border-border/60 bg-muted/20">
                        <SelectValue placeholder="Select a community" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">🌍 General (All Communities)</SelectItem>
                        {communities.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            c/{c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="question-topic" className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5" /> Topic Tag
                    </Label>
                    <Select
                      value={selectedTopicId || topics[0]?.id || ""}
                      onValueChange={(val) => setSelectedTopicId(val)}
                    >
                      <SelectTrigger id="question-topic" className="h-9 text-xs rounded-xl border-border/60 bg-muted/20">
                        <SelectValue placeholder="Choose a topic" />
                      </SelectTrigger>
                      <SelectContent>
                        {topics.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            #{t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Question Title Input */}
                <div className="space-y-1.5">
                  <Label htmlFor="question-title-input" className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Question Prompt *</span>
                    <span className="text-muted-foreground font-normal text-[11px]">{content.length}/300</span>
                  </Label>
                  <Textarea
                    id="question-title-input"
                    value={content}
                    onChange={(e) => setContent(e.target.value.slice(0, 300))}
                    placeholder="Start your question with 'What', 'How', 'Why', etc."
                    className="min-h-[90px] text-base font-medium resize-none rounded-xl border-border/60 bg-background focus-visible:ring-1 focus-visible:ring-amber-500/50 p-3 leading-relaxed"
                    autoFocus
                  />
                </div>

                {/* Optional Question Context / Details */}
                <div className="space-y-1.5">
                  <Label htmlFor="question-details-input" className="text-xs font-semibold text-muted-foreground">
                    Additional Context or Details (Optional)
                  </Label>
                  <Textarea
                    id="question-details-input"
                    value={questionDetails}
                    onChange={(e) => setQuestionDetails(e.target.value)}
                    placeholder="Provide any background info, code snippets, constraints, or what solutions you have already tried..."
                    className="min-h-[100px] text-sm resize-none rounded-xl border-border/50 bg-muted/15 focus-visible:ring-1 focus-visible:ring-amber-500/50 p-3"
                  />
                </div>

                {/* Attachments Section */}
                <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs h-8 border-border/60 hover:bg-amber-500/10 hover:text-amber-600 gap-1.5"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      Add Image
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`rounded-full text-xs h-8 border-border/60 gap-1.5 ${
                        attachedBrainId ? "bg-primary/15 text-primary border-primary/30" : "hover:bg-primary/10 hover:text-primary"
                      }`}
                      onClick={() => setIsWizardOpen(true)}
                    >
                      <BrainCircuit className="w-3.5 h-3.5" />
                      {attachedBrainId ? "Brain Attached" : "Attach Decision Brain"}
                    </Button>
                    {/* Edit-policy selector — who can edit this post after publish.
                        Defaults to "me-only" (safest). The author can always edit
                        their own post regardless of this setting. */}
                    <Select value={editPolicy} onValueChange={(v) => setEditPolicy(v as typeof editPolicy)}>
                      <SelectTrigger className="rounded-full text-xs h-8 border-border/60 gap-1.5 w-auto min-w-[150px]">
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="me-only">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">Me only</span>
                            <span className="text-[10px] text-muted-foreground">Only you can edit this post</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="verified-experts">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">Expert proposals</span>
                            <span className="text-[10px] text-muted-foreground">Expert proposals (review availability varies)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="public">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">Public</span>
                            <span className="text-[10px] text-muted-foreground">Anyone can propose edits (moderated)</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Preview attached media or brain */}
                {attachedBrainId && (
                  <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center text-primary">
                        <BrainCircuit className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">Interactive Decision Brain Attached</p>
                        <p className="text-[11px] text-muted-foreground">Readers can simulate logic branches.</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon" aria-label="Upload image"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => setAttachedBrainId(null)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}

                {mediaUrls.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {mediaUrls.map((url, index) => (
                      <div key={index} className="relative group rounded-xl overflow-hidden aspect-video border border-border/50">
                        <img src={url} alt="Attached" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        <Button
                          variant="destructive"
                          size="icon" aria-label="Remove image"
                          className="absolute top-1 right-1 h-5 w-5 opacity-80 group-hover:opacity-100 transition-opacity rounded-full"
                          onClick={() => setMediaUrls((urls) => urls.filter((_, i) => i !== index))}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* 2. ANSWER FORMAT (Quora Question Picker & Composer)       */}
            {/* ======================================================== */}
            {postType === "answer" && (
              <div id="answer-format-section" className="space-y-4 animate-in fade-in duration-200">
                {!selectedQuestion ? (
                  /* Stage A: Browse and Select a Question from Communities */
                  <div className="space-y-3.5">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-sm sm:text-base font-bold text-foreground">
                        Questions for you to answer
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Select a question from your communities to share your insights, reasoning, or mental models.
                      </p>
                    </div>

                    {/* Search & Community filter bar */}
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="search-questions-input"
                          value={questionSearchQuery}
                          onChange={(e) => setQuestionSearchQuery(e.target.value)}
                          placeholder="Search questions or topics..."
                          className="pl-9 h-9 text-xs bg-muted/20 border-border/60 rounded-xl"
                        />
                      </div>

                      {/* Filter Chips */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                        <Button
                          type="button"
                          variant={filterCommunity === "all" ? "default" : "outline"}
                          size="sm"
                          className="rounded-full h-6 text-[11px] px-2.5 shrink-0 border-border/60"
                          onClick={() => setFilterCommunity("all")}
                        >
                          All Communities
                        </Button>
                        {communities.map((c) => (
                          <Button
                            key={c.id}
                            type="button"
                            variant={filterCommunity === c.name ? "default" : "outline"}
                            size="sm"
                            className="rounded-full h-6 text-[11px] px-2.5 shrink-0 border-border/60"
                            onClick={() => setFilterCommunity(c.name)}
                          >
                            c/{c.name}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Question List Cards (Reddit/Quora style) */}
                    <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                      {filteredQuestions.length === 0 ? (
                        <div className="text-center py-8 px-4 border border-dashed border-border/60 rounded-2xl space-y-2">
                          <CircleHelp className="w-8 h-8 text-muted-foreground mx-auto" />
                          <p className="text-sm font-semibold text-foreground">No questions found</p>
                          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                            Try a different search or be the first to ask a question!
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="rounded-full text-xs mt-2"
                            onClick={() => setPostType("question")}
                          >
                            Ask a Question
                          </Button>
                        </div>
                      ) : (
                        filteredQuestions.map((q) => (
                          <div
                            key={q.id}
                            id={`question-card-${q.id}`}
                            onClick={() => {
                              triggerHaptic("light");
                              setSelectedQuestion(q);
                            }}
                            className="group p-3.5 rounded-2xl border border-border/60 bg-muted/15 hover:bg-muted/30 hover:border-sky-500/40 transition-all cursor-pointer space-y-2 text-left"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {q.communityName && (
                                  <Badge variant="secondary" className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-none text-[10px] font-semibold h-4.5 px-2 rounded-full">
                                    c/{q.communityName}
                                  </Badge>
                                )}
                                {q.topicName && (
                                  <span className="text-[11px] text-muted-foreground font-medium">#{q.topicName}</span>
                                )}
                                <span className="text-[11px] text-muted-foreground/60">• Asked by {q.authorName || "Community Member"}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                                <MessageCircle className="w-3 h-3" />
                                {q.answerCount ? `${q.answerCount} answers` : "No answers yet"}
                              </span>
                            </div>

                            <h4 className="font-semibold text-sm sm:text-[15px] text-foreground leading-snug group-hover:text-sky-500 transition-colors">
                              {q.title}
                            </h4>

                            {q.details && (
                              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                {q.details}
                              </p>
                            )}

                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400 group-hover:underline flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> Write Answer
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2.5 rounded-full text-xs font-semibold text-sky-600 bg-sky-500/10 group-hover:bg-sky-500 group-hover:text-white transition-all"
                              >
                                Answer
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  /* Stage B: Write Answer for Selected Question */
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5 rounded-lg -ml-1"
                      onClick={() => setSelectedQuestion(null)}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to questions
                    </Button>

                    {/* Pinned Question Context Card (Quora Style) */}
                    <div className="p-3.5 rounded-2xl border-l-4 border-l-sky-500 border border-border/50 bg-sky-500/5 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                          Answering Question
                        </span>
                        {selectedQuestion.communityName && (
                          <Badge variant="outline" className="text-[10px] h-4.5 px-2 rounded-full border-sky-500/30 text-sky-600 dark:text-sky-300">
                            c/{selectedQuestion.communityName}
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          by {selectedQuestion.authorName || "Community Member"}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm sm:text-base text-foreground leading-snug">
                        {selectedQuestion.title}
                      </h4>
                      {selectedQuestion.details && (
                        <p className="text-xs text-muted-foreground border-t border-border/30 pt-1.5 mt-1">
                          {selectedQuestion.details}
                        </p>
                      )}
                    </div>

                    {/* Answer Composer */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-6 h-6 ring-1 ring-border/50">
                          <AvatarFallback className="bg-sky-500/20 text-sky-600 font-bold text-[10px]">ME</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-semibold text-foreground">Your Answer</span>
                      </div>

                      <Textarea
                        id="answer-content-input"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Write a helpful, detailed answer... Share step-by-step reasoning, insights, code, or mental models."
                        className="min-h-[160px] text-sm sm:text-base resize-none rounded-xl border-border/60 bg-background focus-visible:ring-1 focus-visible:ring-sky-500/50 p-3.5 leading-relaxed"
                        autoFocus
                      />
                    </div>

                    {/* Answer Attachments */}
                    <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full text-xs h-8 border-border/60 hover:bg-sky-500/10 hover:text-sky-600 gap-1.5"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          Add Diagram/Image
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={`rounded-full text-xs h-8 border-border/60 gap-1.5 ${
                            attachedBrainId ? "bg-primary/15 text-primary border-primary/30" : "hover:bg-primary/10 hover:text-primary"
                          }`}
                          onClick={() => setIsWizardOpen(true)}
                        >
                          <BrainCircuit className="w-3.5 h-3.5" />
                          {attachedBrainId ? "Brain Attached" : "Attach Decision Brain"}
                        </Button>
                      </div>
                    </div>

                    {attachedBrainId && (
                      <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center text-primary">
                            <BrainCircuit className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">Interactive Decision Brain Attached</p>
                            <p className="text-[11px] text-muted-foreground">Supports your answer with interactive decision pathways.</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon" aria-label="Remove tag"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => setAttachedBrainId(null)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}

                    {mediaUrls.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {mediaUrls.map((url, index) => (
                          <div key={index} className="relative group rounded-xl overflow-hidden aspect-video border border-border/50">
                            <img src={url} alt="Attached" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                            <Button
                              variant="destructive"
                              size="icon" aria-label="Remove tag"
                              className="absolute top-1 right-1 h-5 w-5 opacity-80 group-hover:opacity-100 transition-opacity rounded-full"
                              onClick={() => setMediaUrls((urls) => urls.filter((_, i) => i !== index))}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* Part 2 Task 1: NOTE FORMAT — inline photo/text/html      */}
            {/* ======================================================== */}
            {postType === "note" && (
              <div id="note-format-section" className="space-y-4 animate-in fade-in duration-200">
                <div className="flex items-start gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-900 dark:text-emerald-200">
                  <StickyNote className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Note — inline content card</p>
                    <p className="text-emerald-800/90 dark:text-emerald-300/90">
                      Attach a photo, text snippet, or HTML. The content shows inline in the feed — no tap needed.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => notePhotoInputRef.current?.click()}>
                    <ImageIcon className="w-4 h-4" /> Add Photo
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => addNoteAttachment("text")}>
                    <FileText className="w-4 h-4" /> Add Text
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => addNoteAttachment("html")}>
                    <Code className="w-4 h-4" /> Add HTML
                  </Button>
                </div>

                <input
                  ref={notePhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (!f) return;
                    if (f.size > 1024 * 1024) {
                      toast({ title: "Image too large", description: "Please choose an image under 1MB.", variant: "destructive" });
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setNoteAttachments((prev) => [...prev, { type: "photo", data: reader.result as string, caption: "" }]);
                    };
                    reader.readAsDataURL(f);
                  }}
                />

                {/* Render existing attachments — preview exactly how they'll appear in the feed */}
                {noteAttachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No attachments yet. Add a photo, text snippet, or HTML above.</p>
                ) : (
                  <div className="space-y-3">
                    {noteAttachments.map((att, i) => (
                      <div key={i} className="relative border border-border/50 rounded-[16px] overflow-hidden bg-card">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove attachment"
                          className="absolute top-2 right-2 z-10 h-7 w-7 rounded-full bg-background/80 hover:bg-background"
                          onClick={() => setNoteAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                        {att.type === "photo" && (
                          <img src={att.data} alt="Note attachment" className="w-full max-h-80 object-cover" />
                        )}
                        {att.type === "text" && (
                          <Textarea
                            value={att.data}
                            onChange={(e) => setNoteAttachments((prev) => prev.map((a, idx) => idx === i ? { ...a, data: e.target.value } : a))}
                            placeholder="Type your text note…"
                            className="border-0 rounded-none min-h-[120px] resize-none focus-visible:ring-0"
                          />
                        )}
                        {att.type === "html" && (
                          <Textarea
                            value={att.data}
                            onChange={(e) => setNoteAttachments((prev) => prev.map((a, idx) => idx === i ? { ...a, data: e.target.value } : a))}
                            placeholder="<div>Your HTML here</div>"
                            className="border-0 rounded-none min-h-[120px] resize-none font-mono text-xs focus-visible:ring-0"
                          />
                        )}
                        <Input
                          value={att.caption ?? ""}
                          onChange={(e) => setNoteAttachments((prev) => prev.map((a, idx) => idx === i ? { ...a, caption: e.target.value } : a))}
                          placeholder="Caption (optional)"
                          className="border-0 border-t border-border/50 rounded-none text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* 3. STANDARD POST FORMAT                                  */}
            {/* ======================================================== */}
            {postType === "post" && (
              <div id="standard-post-section" className="space-y-4 animate-in fade-in duration-200">
                {/* Reddit Style Post Format */}
                
                {/* 1. Community Selection + B: Recent circles shortcut */}
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex-1 min-w-0">
                    <Select
                      value={selectedCommunityId || "general"}
                      onValueChange={(val) => setSelectedCommunityId(val === "general" ? "" : val)}
                    >
                      <SelectTrigger id="post-community" className="h-10 text-sm font-semibold rounded-full border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors w-full focus:ring-0">
                        <SelectValue placeholder="Choose a community" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general" className="font-semibold">
                          <span className="flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground"/> 🌍 General Feed</span>
                        </SelectItem>
                        {communities.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="font-semibold">
                            c/{c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Small topic selector if needed */}
                  <div className="w-[140px] flex items-center gap-1">
                    <Select value={selectedTopicId || topics[0]?.id || ""} onValueChange={(val) => setSelectedTopicId(val)}>
                      <SelectTrigger className="h-8 text-xs rounded-full border-none bg-transparent hover:bg-muted/30 focus:ring-0 flex-1">
                        <SelectValue placeholder="Topic" />
                      </SelectTrigger>
                      <SelectContent>
                        {topics.map((t) => (
                          <SelectItem key={t.id} value={t.id}>#{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="icon" aria-label="Cancel" className="h-7 w-7 rounded-full bg-muted/40 text-muted-foreground hover:bg-muted/60" onClick={() => {
                        const newTopic = prompt("Enter custom topic name (without #):");
                        if (newTopic && newTopic.trim()) {
                            // Add handling for custom topics if the parent allows, otherwise just select it locally if supported
                            // For UI preview, we just show a toast or alert since topic creation is usually complex
                            // Here, we can spoof it by adding it to tags
                            setPostTags(prev => prev.includes(newTopic) ? prev : [...prev, newTopic.trim()]);
                        }
                    }}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* 2. Title Input */}
                <div className="space-y-1">
                  <Input
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    placeholder="Title"
                    className="text-lg font-bold border-none focus-visible:ring-0 px-1 placeholder:text-muted-foreground/60 shadow-none bg-transparent"
                  />
                  <div className="h-px bg-border/40 w-full" />
                </div>

                {/* 3. Tags/Flair Input */}
                <div className="flex flex-wrap gap-2 items-center px-1">
                  {postTags.map(tag => (
                    <Badge key={tag} variant="secondary" className="bg-muted text-foreground text-xs rounded-full px-3 py-1 flex items-center gap-1">
                      {tag}
                      <X className="w-3 h-3 cursor-pointer hover:text-destructive" onClick={() => setPostTags(postTags.filter(t => t !== tag))} />
                    </Badge>
                  ))}
                  <div className="flex items-center bg-muted/20 rounded-full px-3 py-1 border border-border/50 focus-within:border-primary/50 transition-colors">
                    <Search className="w-3.5 h-3.5 text-muted-foreground mr-1.5" />
                    <input
                      type="text"
                      maxLength={40}
                      placeholder="Add tag (optional)..."
                      className="bg-transparent text-xs outline-none w-48 text-foreground"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && tagInput.trim()) {
                          e.preventDefault();
                          if (!postTags.includes(tagInput.trim())) {
                            if (postTags.length >= 10) {
                              toast({ title: "Tag limit reached", description: "Use up to 10 tags per post.", variant: "destructive" });
                              return;
                            }
                            setPostTags([...postTags, tagInput.trim()]);
                          }
                          setTagInput("");
                        }
                      }}
                    />
                  </div>
                </div>

                {/* B: Suggest existing tags from recent posts — no inventing required */}
                {recentTags.length > 0 && postTags.length === 0 && !tagInput && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <span className="text-[10px] text-muted-foreground self-center mr-1">Suggested:</span>
                    {recentTags.slice(0, 6).map(tag => (
                      <button
                        key={tag}
                        type="button"
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        onClick={() => setPostTags([...postTags, tag])}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

                {/* 4. Content Textarea & Markdown Toolbar */}
                <div className="rounded-xl border border-border/60 bg-card overflow-hidden focus-within:ring-1 focus-within:ring-primary/50 transition-all">
                  <Textarea
                    id="post-content-input"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="What are you thinking about, learning, working on, or trying to solve?"
                    className="min-h-[140px] text-sm resize-none border-none focus-visible:ring-0 px-4 py-3 leading-relaxed shadow-none bg-transparent"
                    autoFocus
                  />
                  
                  {/* Rich Text / Markdown Toolbar — FRAGMENT 7: removed 7 dead
                      buttons (Link, Spoiler, Quote, Inline Code, Code Block,
                      Table, Markdown Mode) that had no onClick handlers. The
                      toolbar area is kept as a visual separator. */}
                  <div className="flex items-center gap-1 p-2 bg-muted/30 border-t border-border/40 overflow-x-auto scrollbar-none">
                    <span className="text-[10px] text-muted-foreground/60 font-medium px-1">Plain text — supports line breaks and URLs</span>
                  </div>
                </div>

                {/* Optional Event Creation Box */}
                {isEventMode && (
                  <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                        <CalendarPlus className="w-4 h-4" />
                        <span>Event Details</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => setIsEventMode(false)}
                      >
                        Remove Event
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor="event-title-input" className="text-xs">Event Title *</Label>
                        <Input
                          id="event-title-input"
                          value={eventTitle}
                          onChange={(e) => setEventTitle(e.target.value)}
                          placeholder="e.g. Brainstorming Workshop"
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="event-date-input" className="text-xs">Date *</Label>
                        <Input
                          id="event-date-input"
                          type="date"
                          value={eventDate}
                          onChange={(e) => setEventDate(e.target.value)}
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="event-time-input" className="text-xs">Start Time *</Label>
                        <Input
                          id="event-time-input"
                          type="time"
                          value={eventTime}
                          onChange={(e) => setEventTime(e.target.value)}
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor="event-location-input" className="text-xs">Location / Link</Label>
                        <Input
                          id="event-location-input"
                          value={eventLocation}
                          onChange={(e) => setEventLocation(e.target.value)}
                          placeholder="Virtual or physical location"
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Attachments Section */}
                <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs h-8 border-border/60 gap-1.5 hover:bg-muted/40"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-primary" />
                      Add Photo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`rounded-full text-xs h-8 border-border/60 gap-1.5 ${
                        attachedBrainId ? "bg-primary/15 text-primary border-primary/30" : "hover:bg-muted/40"
                      }`}
                      onClick={() => setIsWizardOpen(true)}
                    >
                      <BrainCircuit className="w-3.5 h-3.5 text-primary" />
                      {attachedBrainId ? "Brain Attached" : "Attach Brain"}
                    </Button>
                    <Button
                      type="button"
                      variant={isEventMode ? "secondary" : "outline"}
                      size="sm"
                      className="rounded-full text-xs h-8 border-border/60 gap-1.5"
                      onClick={() => setIsEventMode(!isEventMode)}
                    >
                      <CalendarPlus className="w-3.5 h-3.5 text-primary" />
                      {isEventMode ? "Event Added" : "Add Event"}
                    </Button>
                  </div>
                </div>

                {attachedBrainId && (
                  <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center text-primary">
                        <BrainCircuit className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">Interactive Decision Brain Attached</p>
                        <p className="text-[11px] text-muted-foreground">Connected decision engine module.</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon" aria-label="Close"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => setAttachedBrainId(null)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}

                {mediaUrls.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {mediaUrls.map((url, index) => (
                      <div key={index} className="relative group rounded-xl overflow-hidden aspect-video border border-border/50">
                        <img src={url} alt="Attached" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        <Button
                          variant="destructive"
                          size="icon" aria-label="Close"
                          className="absolute top-1 right-1 h-5 w-5 opacity-80 group-hover:opacity-100 transition-opacity rounded-full"
                          onClick={() => setMediaUrls((urls) => urls.filter((_, i) => i !== index))}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Hidden File Input — single shared picker for all post types.
              The previous second <input> with capture="environment" was dead
              code (no caller ever invoked its ref) and just added a second
              invisible file input to the DOM. */}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />

          {/* Dialog Footer Actions */}
          <DialogFooter className="p-4 sm:px-6 border-t border-border/50 bg-muted/15 flex flex-row items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full text-xs text-muted-foreground hover:text-foreground"
              onClick={handleClose}
              disabled={isPublishing}
            >
              Cancel
            </Button>

            <div className="flex items-center gap-2">
              {postType === "question" && (
                <Button
                  type="button"
                  id="btn-submit-question"
                  onClick={handlePublish}
                  disabled={isPublishing || !content.trim()}
                  className="bg-amber-600 hover:bg-amber-500 text-white rounded-full px-5 text-xs font-semibold h-8 shadow-sm"
                >
                  <CircleHelp className="w-3.5 h-3.5 mr-1.5" />
                  Ask Question
                </Button>
              )}

              {postType === "answer" && (
                selectedQuestion ? (
                  <Button
                    type="button"
                    id="btn-submit-answer"
                    onClick={handlePublish}
                    disabled={isPublishing || !content.trim()}
                    className="bg-sky-600 hover:bg-sky-500 text-white rounded-full px-5 text-xs font-semibold h-8 shadow-sm"
                  >
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                    Submit Answer
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Select a question to answer
                  </p>
                )
              )}

              {postType === "post" && (
                <Button
                  type="button"
                  id="btn-submit-post"
                  onClick={handlePublish}
                  disabled={isPublishing || (!content.trim() && !isEventMode)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-5 text-xs font-semibold h-8 shadow-sm"
                >
                  <PenSquare className="w-3.5 h-3.5 mr-1.5" />
                  Post
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isWizardOpen && (
        <Suspense fallback={null}>
          <WizardModal
            isOpen={isWizardOpen}
            onClose={() => setIsWizardOpen(false)}
            onSave={handleBrainSave}
          />
        </Suspense>
      )}
    </>
  );
}
