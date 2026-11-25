import { useState, useMemo } from "react";
import { useComments, CommentWithChildren } from "@/hooks/use-comments";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle,
  MoreHorizontal,
  Copy,
  Lock,
  Pin,
  PinOff,
  ChevronDown,
  ChevronUp,
  Shield,
  Pencil,
  Trash2,
  RotateCcw,
  ArrowDownUp,
  ArrowBigUp,
  ArrowBigDown,
  Landmark,
  Users,
  Link as LinkIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { triggerHaptic } from "@/lib/device";
import { Comment } from "@/lib/types";
import { computeCommentRank } from "@/lib/hive-mind";
import { useAuth } from "@/components/auth/AuthContext";
import { displayNameOr, userIdOr } from "@/lib/user-data";

interface CommentThreadProps {
  postId: string;
  postAuthorId?: string;
  currentUserId?: string;
}

type SortMode = "gravity" | "newest" | "top" | "controversial" | "qa";

/**
 * CommentThread — unified thread (4-river system removed).
 *
 * The old design split comments into 4 author-picked "rivers"
 * (facts/experience/debate/breakthrough) with structural gatekeeping —
 * every commenter had to self-classify before writing and the discussion
 * fragmented into silos. Replaced with ONE threaded list plus READER
 * classification votes on every comment:
 *
 *  - 赞/踩 (upvote/downvote) — quality signal, feeds gravity ranking
 *  - House vote (Landmark)  — "House view": institutional / verifiable
 *    evidence (facts, official sources, expert consensus)
 *  - Mouth vote (Users)     — "Word of mouth": crowd sentiment / lived
 *    experience
 *
 * House/Mouth are mutually exclusive and community-driven — the streams
 * emerge from votes instead of being declared at entry. Old records may
 * still carry a legacy `stream` property; it is ignored everywhere.
 *
 * Kept mechanics: gravity ranking, fossilized Consensus Summary crown,
 * pin/edit/delete/restore, confidential replies, collapse at depth 3.
 */
export function CommentThread({
  postId,
  postAuthorId,
  currentUserId: currentUserIdProp,
}: CommentThreadProps) {
  // Phase 2: real user identity. Falls back to "me" for guest mode.
  const { user } = useAuth();
  const currentUserId = currentUserIdProp ?? userIdOr(user);
  const currentDisplayName = displayNameOr(user);

  const {
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
  } = useComments(postId);

  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [content, setContent] = useState("");          // top-level reply
  const [inlineContent, setInlineContent] = useState(""); // inline reply (A.7 fix — separate state)
  // Submit guard — prevents duplicate comments on rapid Enter pressing.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [isConfidentialReply, setIsConfidentialReply] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("gravity");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const { toast } = useToast();

  // BUG FIX: the early return for isLoadingComments MUST come AFTER all
  // hooks, not before the useMemo below. Previously this returned early
  // BEFORE the useMemo, which meant the component called a different
  // number of hooks when isLoadingComments flipped from true→false →
  // React error #310 ("Rendered more hooks than during the previous
  // render"). Now the useMemo is always called; the early return just
  // changes what gets rendered.

  // Filter confidential comments at the source.
  const visibleComments: Comment[] = comments.filter((c) => {
    if (!c.isConfidential) return true;
    return c.authorId === currentUserId || postAuthorId === currentUserId || c.authorId === postAuthorId;
  });

  // Build ONE tree (rivers removed). Deps are [comments] only —
  // buildCommentTree is a pure function of its input, so its identity
  // changing doesn't matter; what matters is that the comments array
  // changed. The previous dep [comments, buildCommentTree] invalidated
  // the memo every render because buildCommentTree is a fresh function
  // on every useComments call (A.1 fix).
  const tree = useMemo(
    () => buildCommentTree(visibleComments),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comments],
  );

  // Root-level sort (gravity default). Children keep their
  // buildCommentTree order (pinned-first, newest).
  const sortedRoots = useMemo(() => {
    const sorted = [...tree];
    if (sortMode === "gravity") {
      sorted.sort((a, b) => computeCommentRank(b) - computeCommentRank(a));
    } else if (sortMode === "newest") {
      sorted.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sortMode === "top") {
      // Top = highest net upvotes (upvotes - downvotes). Reddit parity.
      sorted.sort((a, b) => {
        const aNet = (a.upvotes ?? 0) - (a.downvotes ?? 0);
        const bNet = (b.upvotes ?? 0) - (b.downvotes ?? 0);
        return bNet - aNet;
      });
    } else if (sortMode === "controversial") {
      // High total votes + close to a 50/50 up/down split (Reddit's
      // algorithm: more people cared AND the crowd is split).
      sorted.sort((a, b) => {
        const aUp = a.upvotes ?? 0, aDown = a.downvotes ?? 0;
        const bUp = b.upvotes ?? 0, bDown = b.downvotes ?? 0;
        const aTotal = aUp + aDown, bTotal = bUp + bDown;
        if (aTotal === 0 && bTotal === 0) return 0;
        if (aTotal === 0) return 1;
        if (bTotal === 0) return -1;
        const aRatio = Math.min(aUp, aDown) / Math.max(aUp, aDown);
        const bRatio = Math.min(bUp, bDown) / Math.max(bUp, bDown);
        return (bRatio * bTotal) - (aRatio * aTotal);
      });
    } else if (sortMode === "qa") {
      // Q&A = threads with more answers float up.
      sorted.sort((a, b) => b.children.length - a.children.length);
    }
    return sorted;
  }, [tree, sortMode]);

  // Fossilized comments (rendered at the crown as a Consensus Summary Block).
  const fossilized = visibleComments.filter((c) => c.isFossilized);

  // Now safe to early-return — all hooks above have been called.
  if (isLoadingComments) {
    return <div className="p-4 text-sm text-muted-foreground text-center">Loading replies...</div>;
  }

  const handleSubmit = async (e: React.FormEvent, parentId: string | null, body?: string) => {
    e.preventDefault();
    // Submit guard — prevents duplicate comments on rapid Enter pressing.
    if (isSubmitting) return;
    const text = (body ?? content).trim(); // use inlineContent if passed, else top-level content
    if (!text) return;

    setIsSubmitting(true);
    triggerHaptic("success");
    try {
      await addComment({
        postId,
        parentId,
        content: text,
        authorName: currentDisplayName,
        isConfidential: isConfidentialReply,
      });
      // Clear the right state — top-level or inline (A.7 fix).
      if (body !== undefined) {
        setInlineContent("");
      } else {
        setContent("");
      }
      setReplyToId(null);
      setIsConfidentialReply(false);
    } catch (error) {
      toast({
        title: "Couldn't post comment",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePin = async (node: CommentWithChildren) => {
    try {
      await pinReply({ id: node.id, postId, parentId: node.parentId });
      toast({
        title: node.isPinned ? "Reply unpinned" : "Reply pinned",
        description: node.isPinned ? "No longer anchored." : "Anchored to the top of the thread.",
      });
    } catch (error) {
      toast({ title: "Couldn't pin reply", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const startEdit = (node: CommentWithChildren) => {
    setEditingId(node.id);
    setEditDraft(node.content || "");
    setReplyToId(null);
    triggerHaptic("selection");
  };
  const cancelEdit = () => { setEditingId(null); setEditDraft(""); };
  const saveEdit = async (node: CommentWithChildren) => {
    if (!editDraft.trim()) { toast({ title: "Reply can't be empty", variant: "destructive" }); return; }
    try {
      await editComment({ id: node.id, postId, content: editDraft.trim() });
      setEditingId(null); setEditDraft("");
      toast({ title: "Reply updated" });
    } catch (error) {
      toast({ title: "Couldn't save edit", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const handleDelete = async (node: CommentWithChildren) => {
    try {
      await deleteComment({ id: node.id, postId, restore: false });
      toast({ title: "Reply deleted", description: "Hidden from the thread. Restore from the menu." });
    } catch (error) {
      toast({ title: "Couldn't delete reply", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };
  const handleRestore = async (node: CommentWithChildren) => {
    try {
      await deleteComment({ id: node.id, postId, restore: true });
      toast({ title: "Reply restored" });
    } catch (error) {
      toast({ title: "Couldn't restore", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const canPin = (node: CommentWithChildren) =>
    postAuthorId === currentUserId && node.parentId !== null && !node.isOptimistic && !node.isFossilized;

  const canEditOrDelete = (node: CommentWithChildren) =>
    !node.isOptimistic && !node.isFossilized &&
    (node.authorId === currentUserId || (!node.authorId && node.authorName === currentDisplayName));

  const COLLAPSE_DEPTH = 3;

  // ── Comment Node renderer (shared across the whole thread) ──────

  const CommentNode = ({ node, depth = 0 }: { node: CommentWithChildren; depth?: number }) => {
    const isReplying = replyToId === node.id;
    const isEditing = editingId === node.id;
    const isCollapsed = collapsed[node.id];
    const shouldAutoCollapse = depth >= COLLAPSE_DEPTH;
    const showAsCollapsed = isCollapsed || (shouldAutoCollapse && !(node.id in collapsed));
    const paddingLeft = Math.min(depth, COLLAPSE_DEPTH) * 1.5;

    if (node.isDeleted) {
      return (
        <div className="flex items-center gap-3 mt-2 py-1.5 px-2 text-[13px] text-muted-foreground/80 italic" style={{ paddingLeft: `${paddingLeft}rem` }}>
          <Avatar className="w-7 h-7 grayscale opacity-50 shrink-0"><AvatarFallback className="text-[10px] bg-muted">··</AvatarFallback></Avatar>
          <span className="flex-1">Reply deleted by author.</span>
          {canEditOrDelete(node) && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50" onClick={() => void handleRestore(node)}>
              <RotateCcw className="w-3 h-3 mr-1" /> Restore
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col mt-2 group" style={{ paddingLeft: `${paddingLeft}rem` }}>
        <div className={`flex gap-3 relative rounded-lg ${node.isFossilized ? "hive-fossilized p-3" : ""}`}>
          <div className="flex flex-col items-center shrink-0">
            <Avatar className="w-8 h-8 border z-10 bg-background">
              <AvatarFallback className="text-[12px] bg-muted font-medium">
                {(node.authorName || "?").substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {node.children.length > 0 && (
              <button type="button" onClick={() => setCollapsed((prev) => ({ ...prev, [node.id]: !prev[node.id] }))} aria-label={isCollapsed ? "Expand" : "Collapse"} className="w-[2px] grow mt-2 mb-[-8px] rounded-full bg-border/40 hover:bg-primary/40 transition-colors cursor-pointer" />
            )}
          </div>
          <div className="flex-1 pb-2 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-[14px] hover:underline cursor-pointer truncate">{node.authorName}</span>
              <span className="text-[12px] text-muted-foreground ml-2 shrink-0">
                {formatDistanceToNow(node.createdAt, { addSuffix: true }).replace('about ', '').replace(' minutes', 'm').replace(' hours', 'h').replace(' days', 'd')}
                {node.editedAt && <span className="italic text-[10px] ml-1">· edited</span>}
                {node.isFossilized && <span className="ml-1 text-amber-500 font-semibold text-[10px]">· FOSSILIZED</span>}
              </span>
            </div>

            {node.isPinned && (
              <div className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                <Pin className="w-2.5 h-2.5" /> Pinned
              </div>
            )}
            {node.isConfidential && (
              <div className="inline-flex items-center gap-1 mt-0.5 ml-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
                <Lock className="w-2.5 h-2.5" /> Confidential
              </div>
            )}
            {(node.sourceLinks ?? 0) > 0 && (
              <div className="inline-flex items-center gap-1 mt-0.5 ml-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-semibold">
                <LinkIcon className="w-2.5 h-2.5" /> {node.sourceLinks} source{(node.sourceLinks ?? 0) > 1 ? "s" : ""}
              </div>
            )}

            {isEditing ? (
              <div className="mt-1.5 space-y-2">
                <Textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} className="min-h-[50px] text-[14px] resize-none py-2 px-3 bg-transparent border border-border/50 rounded-xl" autoFocus />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" className="rounded-full text-xs" onClick={cancelEdit}>Cancel</Button>
                  <Button size="sm" className="rounded-full px-4 font-semibold" onClick={() => void saveEdit(node)} disabled={!editDraft.trim()}>Save</Button>
                </div>
              </div>
            ) : (
              <p className="text-[14px] whitespace-pre-wrap mt-0.5 leading-relaxed text-foreground/90 break-words">{node.content || ""}</p>
            )}

            <div className="flex items-center justify-between pt-1.5 pb-0.5 -ml-2 gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Vote controls omit visible totals; this is not an API privacy boundary. */}
                <div className="flex items-center gap-0.5 rounded-full bg-muted/30 py-0.5 px-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 w-6 p-0 rounded-full active:scale-90 ${node.myVote === "up" ? "text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20" : "text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10"}`}
                    onClick={() => { triggerHaptic("light"); void voteComment({ id: node.id, direction: "up", postId }).catch((e) => toast({ title: "Couldn't vote", description: e instanceof Error ? e.message : "", variant: "destructive" })); }}
                    aria-label="Upvote"
                    aria-pressed={node.myVote === "up"}
                  >
                    <ArrowBigUp className={`w-3.5 h-3.5 ${node.myVote === "up" ? "fill-current" : ""}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 w-6 p-0 rounded-full active:scale-90 ${node.myVote === "down" ? "text-red-500 bg-red-500/10 hover:bg-red-500/20" : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10"}`}
                    onClick={() => { triggerHaptic("light"); void voteComment({ id: node.id, direction: "down", postId }).catch((e) => toast({ title: "Couldn't vote", description: e instanceof Error ? e.message : "", variant: "destructive" })); }}
                    aria-label="Downvote"
                    aria-pressed={node.myVote === "down"}
                  >
                    <ArrowBigDown className={`w-3.5 h-3.5 ${node.myVote === "down" ? "fill-current" : ""}`} />
                  </Button>
                </div>
                {/* House / Mouth classification votes — rivers made emergent:
                    readers classify each comment instead of the author
                    declaring a stream at entry. Mutually exclusive. */}
                <Button variant="ghost" size="sm" className={`h-7 px-2 gap-1.5 rounded-full transition-all active:scale-90 ${node.myHouseVote ? "text-indigo-500 bg-indigo-500/10 hover:bg-indigo-500/20" : "text-muted-foreground hover:text-indigo-500 hover:bg-muted/50"}`}
                  title="House view — institutional / verifiable evidence"
                  onClick={() => { triggerHaptic("light"); void voteHouse({ id: node.id, postId }).catch((e) => toast({ title: "Couldn't vote", description: e instanceof Error ? e.message : "", variant: "destructive" })); }}
                  aria-label="House view vote"
                  aria-pressed={node.myHouseVote}
                >
                  <Landmark className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className={`h-7 px-2 gap-1.5 rounded-full transition-all active:scale-90 ${node.myMouthVote ? "text-orange-500 bg-orange-500/10 hover:bg-orange-500/20" : "text-muted-foreground hover:text-orange-500 hover:bg-muted/50"}`}
                  title="Word of mouth — crowd sentiment / lived experience"
                  onClick={() => { triggerHaptic("light"); void voteMouth({ id: node.id, postId }).catch((e) => toast({ title: "Couldn't vote", description: e instanceof Error ? e.message : "", variant: "destructive" })); }}
                  aria-label="Word of mouth vote"
                  aria-pressed={node.myMouthVote}
                >
                  <Users className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full active:scale-90"
                  onClick={() => { triggerHaptic("selection"); setReplyToId(isReplying ? null : node.id); setIsConfidentialReply(false); if (isEditing) cancelEdit(); }}>
                  <MessageCircle className="w-3.5 h-3.5" />
                </Button>
                {canPin(node) && (
                  <Button variant="ghost" size="sm" className={`h-7 px-2.5 rounded-full active:scale-90 ${node.isPinned ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`}
                    onClick={() => void handlePin(node)} aria-label={node.isPinned ? "Unpin" : "Pin"}>
                    {node.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                  </Button>
                )}
                {node.children.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 px-2.5 gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full active:scale-90 text-[12px] font-medium"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [node.id]: !prev[node.id] }))} aria-expanded={!isCollapsed}>
                    {isCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                    <span className="tabular-nums">{node.children.length}</span>
                  </Button>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 rounded-full p-0" aria-label="More actions"><MoreHorizontal className="w-3.5 h-3.5" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { try { navigator.clipboard.writeText(node.content || ""); triggerHaptic("success"); toast({ title: "Copied" }); } catch { toast({ title: "Couldn't copy", variant: "destructive" }); } }}>
                    <Copy className="w-3.5 h-3.5 mr-2" /> Copy
                  </DropdownMenuItem>
                  {canPin(node) && (
                    <DropdownMenuItem onClick={() => void handlePin(node)}>
                      {node.isPinned ? <PinOff className="w-3.5 h-3.5 mr-2" /> : <Pin className="w-3.5 h-3.5 mr-2" />}
                      {node.isPinned ? "Unpin" : "Pin as definitive"}
                    </DropdownMenuItem>
                  )}
                  {canEditOrDelete(node) && !node.isDeleted && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => startEdit(node)}><Pencil className="w-3.5 h-3.5 mr-2" /> Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void handleDelete(node)}><Trash2 className="w-3.5 h-3.5 mr-2" /> Delete</DropdownMenuItem>
                    </>
                  )}
                  {canEditOrDelete(node) && node.isDeleted && (
                    <DropdownMenuItem onClick={() => void handleRestore(node)}><RotateCcw className="w-3.5 h-3.5 mr-2" /> Restore</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {isReplying && (
              <form onSubmit={(e) => handleSubmit(e, node.id, inlineContent)} className="mt-2 mb-1 flex flex-col gap-2">
                <div className="flex gap-2 items-start">
                  <Avatar className="w-6 h-6 shrink-0 mt-1 border"><AvatarFallback className="text-[9px] bg-muted">ME</AvatarFallback></Avatar>
                  <div className="flex-1 flex flex-col gap-2">
                    <Textarea value={inlineContent} onChange={(e) => setInlineContent(e.target.value)} placeholder="Reply..." className="min-h-[50px] text-[14px] resize-none py-2 px-3 bg-transparent border border-border/50 rounded-xl" autoFocus />
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <button type="button" onClick={() => setIsConfidentialReply((v) => !v)} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all active:scale-95 ${isConfidentialReply ? "bg-amber-500/15 text-amber-600 border border-amber-500/40" : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"}`}>
                        {isConfidentialReply ? <Lock className="w-3 h-3" /> : <Shield className="w-3 h-3" />} {isConfidentialReply ? "Confidential" : "Public"}
                      </button>
                      <div className="flex gap-2">
                        <Button type="button" variant="ghost" size="sm" className="rounded-full text-xs" onClick={() => { setReplyToId(null); setIsConfidentialReply(false); setInlineContent(""); }}>Cancel</Button>
                        <Button type="submit" size="sm" className="rounded-full px-4 font-semibold" disabled={!inlineContent.trim()}>Post</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>

        {node.children.length > 0 && !showAsCollapsed && (
          <div className="flex flex-col">
            {node.children.map(child => <CommentNode key={child.id} node={child} depth={depth + 1} />)}
          </div>
        )}
        {node.children.length > 0 && showAsCollapsed && (
          <button type="button" onClick={() => setCollapsed((prev) => ({ ...prev, [node.id]: false }))}
            className="self-start ml-10 mt-1 mb-1 text-[12px] font-semibold text-primary hover:underline cursor-pointer">
            Show {node.children.length} {node.children.length === 1 ? "reply" : "replies"} →
          </button>
        )}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="pt-4">
      {/* Fossilized Consensus Summary Block (crown of the post) */}
      {fossilized.length > 0 && (
        <div className="mb-4 p-4 rounded-xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-500/2">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-500 text-lg">🔒</span>
            <h3 className="text-sm font-bold text-amber-600 dark:text-amber-400 tracking-wide uppercase">Community Wiki</h3>
            <span className="text-[11px] text-muted-foreground">Consensus Summary Block · {fossilized.length} entries</span>
          </div>
          <div className="space-y-2">
            {fossilized.map((c) => {
              return (
                <div key={c.id} className="hive-fossilized p-3 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Community highlight</span>
                    <span className="text-[11px] text-muted-foreground">· {c.authorName}</span>
                    {(c.sourceLinks ?? 0) > 0 && (
                      <span className="text-[11px] text-blue-500 font-semibold inline-flex items-center gap-0.5"><LinkIcon className="w-2.5 h-2.5" />{c.sourceLinks}</span>
                    )}
                  </div>
                  <p className="text-[14px] text-foreground/90 leading-relaxed">{c.content}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sort toggle */}
      {visibleComments.length > 1 && (
        <div className="flex items-center justify-end mb-2">
          <div className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
            <ArrowDownUp className="w-3.5 h-3.5" />
            <span className="font-medium">Sort:</span>
            <button type="button" onClick={() => setSortMode("gravity")} className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${sortMode === "gravity" ? "bg-foreground/10 text-foreground" : "hover:bg-muted/50 hover:text-foreground"}`}>Gravity</button>
            <button type="button" onClick={() => setSortMode("newest")} className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${sortMode === "newest" ? "bg-foreground/10 text-foreground" : "hover:bg-muted/50 hover:text-foreground"}`}>Newest</button>
            <button type="button" onClick={() => setSortMode("top")} className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${sortMode === "top" ? "bg-foreground/10 text-foreground" : "hover:bg-muted/50 hover:text-foreground"}`}>Top</button>
            <button type="button" onClick={() => setSortMode("controversial")} className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${sortMode === "controversial" ? "bg-foreground/10 text-foreground" : "hover:bg-muted/50 hover:text-foreground"}`}>Controversial</button>
            <button type="button" onClick={() => setSortMode("qa")} className={`px-2 py-0.5 rounded-full font-semibold transition-colors ${sortMode === "qa" ? "bg-foreground/10 text-foreground" : "hover:bg-muted/50 hover:text-foreground"}`}>Q&A</button>
          </div>
        </div>
      )}

      {/* Top-level composer — always visible (the rivers' structural
          gatekeeping is gone; no stream pick required to speak). */}
      <form onSubmit={(e) => handleSubmit(e, null)} className="mb-4 border border-border/50 rounded-xl p-3 bg-background/50">
        <div className="flex gap-2 items-start">
          <Avatar className="w-7 h-7 shrink-0 border"><AvatarFallback className="text-[10px] bg-muted">ME</AvatarFallback></Avatar>
          <div className="flex-1 flex flex-col gap-2">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add a comment..."
              className="min-h-[50px] text-[14px] resize-none py-2 px-3 bg-transparent border border-border/50 rounded-xl"
            />
            <div className="flex justify-between items-center flex-wrap gap-2">
              <button type="button" onClick={() => setIsConfidentialReply((v) => !v)} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all active:scale-95 ${isConfidentialReply ? "bg-amber-500/15 text-amber-600 border border-amber-500/40" : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"}`}>
                {isConfidentialReply ? <Lock className="w-3 h-3" /> : <Shield className="w-3 h-3" />} {isConfidentialReply ? "Confidential" : "Public"}
              </button>
              <Button type="submit" size="sm" className="rounded-full px-4 font-semibold" disabled={!content.trim()}>Post</Button>
            </div>
          </div>
        </div>
      </form>

      {/* Unified thread — roots sorted per sortMode, children keep their
          buildCommentTree order (pinned-first, newest). */}
      {tree.length === 0 ? (
        <p className="text-[13px] text-muted-foreground/60 text-center py-6 italic">
          No replies yet — start the thread.
        </p>
      ) : (
        <div className="space-y-1">
          {sortedRoots.map((node) => (
            <CommentNode key={node.id} node={node} />
          ))}
        </div>
      )}
    </div>
  );
}
