import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useMessages } from "@/hooks/use-messages";
import { useDatabase } from "@/hooks/use-database";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageSquare, MessageSquarePlus, ArrowLeft, BrainCircuit } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Conversation, Message } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

// ── Mind-attachment markup ─────────────────────────────────────
// Messages can embed a mind reference using the compact markup
//   [mind:ID|title]
// The renderer (renderMessageContent below) detects this and renders
// an inline mind card instead of the raw markup. This keeps the
// storage format simple (plain string in IDB) while giving the UI
// a rich preview. The same pattern will be reused for file/html
// attachments in UI-9.
const MIND_MARKUP_RE = /\[mind:([a-f0-9-]{36})\|([^\]]+)\]/g;

function renderMessageContent(content: string, onOpenMind?: (mindId: string) => void) {
  const parts: Array<{ type: "text" | "mind"; text: string; mindId?: string }> = [];
  let lastIndex = 0;
  MIND_MARKUP_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MIND_MARKUP_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "mind", text: match[2], mindId: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", text: content.slice(lastIndex) });
  }
  if (parts.length === 0) return content;
  return parts.map((p, i) => {
    if (p.type === "mind") {
      return (
        <button
          key={i}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenMind?.(p.mindId!);
          }}
          className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg px-2 py-1 text-xs font-medium hover:bg-primary/20 transition-colors my-0.5"
        >
          <BrainCircuit className="w-3.5 h-3.5" />
          <span className="truncate max-w-[180px]">{p.text}</span>
        </button>
      );
    }
    return <span key={i}>{p.text}</span>;
  });
}

export function MessagesPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const { conversations, messages: storedMessages, addConversation, addMessage } = useMessages(activeId || undefined);
  const { minds } = useDatabase();
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newChatUser, setNewChatUser] = useState("");
  const [isMindPickerOpen, setIsMindPickerOpen] = useState(false);
  // Send guard — prevents duplicate messages on rapid Enter pressing.
  // The send button is disabled while isSending is true.
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // A clock value read in an effect (not during render) so time-relative
  // fallbacks in the derived conversation/message memos stay pure. Refreshed
  // on a 60s timer — the only consumers are "1 hour ago" and "fallback
  // createdAt" display values, so sub-minute staleness is behaviorally
  // equivalent to the previous per-render Date.now().
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Open a conversation automatically when navigated here with ?conversationId=...
  // (PostCard's "Send to followers" and CommunityPage's Invite/Message buttons
  // all route here after creating a DM so the user lands on the live chat).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cid = params.get("conversationId");
    if (cid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate mount-sync of the URL conversationId param → open the conversation; refactoring to derived state would change behavior (one-time deep-link trigger + URL cleanup side effect).
      setActiveId(cid);
      // Clean the URL so refresh / share doesn't keep re-applying it.
      try {
        window.history.replaceState(null, "", window.location.pathname);
      } catch {
        // ignore
      }
    }
  }, []);

  const favoriteMinds = useMemo(() => minds.filter(b => b.isFavorite), [minds]);
  
  const combinedConversations: Conversation[] = useMemo(() => {
    const mindConvs = favoriteMinds.map(b => ({
      id: `mind-${b.id}`,
      participantIds: [b.title, "me"],
      lastMessage: `Automated push: "Post related to ${b.title} highlights new structural gating."`,
      lastMessageAt: now - 3600000, // Fixed 1 hour ago (was Math.random — flickered every render)
      unreadCount: 1,
      isMind: true
    }));
    return [...conversations, ...mindConvs];
  }, [conversations, favoriteMinds, now]);

  const activeConversation = combinedConversations.find((c) => c.id === activeId);
  const isMindChat = activeId?.startsWith("mind-");

  const messages: Message[] = useMemo(() => {
    if (isMindChat) {
      const bTitle = activeConversation?.participantIds[0] || "Mind";
      return [
        {
          id: "sys-1",
          conversationId: activeId!,
          senderId: bTitle,
          content: `System Alert: Post tagged with ${bTitle} updated node constraints. Review cognitive layout.`,
          createdAt: activeConversation?.lastMessageAt || now
        }
      ];
    }
    return storedMessages;
  }, [isMindChat, storedMessages, activeId, activeConversation, now]);

  const handleAction = (action: string) => {
    if (action === "Attach Mind/Library") {
      // Open the mind picker instead of routing away. The user stays in
      // the chat context and picks a mind to embed as a card.
      if (minds.length === 0) {
        toast({ title: "No minds yet", description: "Create a mind in the Library first, then attach it here.", duration: 4000 });
        return;
      }
      setIsMindPickerOpen(true);
      return;
    }
    if (action === "Attach Photo") {
      // Trigger a hidden file input for image attachments in DMs.
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        if (file.size > 1024 * 1024) {
          toast({ title: "Image too large", description: "Please choose an image under 1MB.", variant: "destructive" });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          setNewMessage(prev => prev + (prev ? " " : "") + dataUrl);
          toast({ title: "Image attached", description: "The image will be sent as a link in your message." });
        };
        reader.readAsDataURL(file);
      };
      input.click();
    } else {
      toast({ title: action, description: "This action is available on mobile." });
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !activeId) return;
    if (isMindChat) return; // Cannot send to mind chats
    // Send guard — prevents duplicate messages on rapid Enter pressing.
    if (isSending) return;
    setIsSending(true);
    try {
      await addMessage({
        id: crypto.randomUUID(),
        conversationId: activeId,
        senderId: "me", // Assuming current user is "me"
        content: newMessage.trim(),
        createdAt: Date.now(),
      });
      setNewMessage("");
    } catch (error) {
      toast({ title: "Couldn't send message", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleStartConversation = async () => {
    const participantId = newChatUser.trim();
    if (!participantId) return;
    if (isSending) return; // reuse the send guard — prevents duplicate conversations on rapid Enter
    setIsSending(true);
    const conversationId = `new-conv-${crypto.randomUUID()}`;
    try {
      await addConversation({
        id: conversationId,
        participantIds: ["me", participantId],
        lastMessage: "",
        lastMessageAt: Date.now(),
        unreadCount: 0,
      });
      setActiveId(conversationId);
      setIsNewChatOpen(false);
      setNewChatUser("");
    } catch (error) {
      toast({ title: "Couldn't start conversation", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  // Insert a mind-card markup into the message input. The renderer
  // (renderMessageContent) detects [mind:ID|title] and renders an
  // inline card. The user can keep typing around it.
  const handleAttachMind = (mindId: string, mindTitle: string) => {
    const markup = `[mind:${mindId}|${mindTitle}]`;
    setNewMessage((prev) => (prev ? `${prev} ${markup}` : markup));
    setIsMindPickerOpen(false);
    toast({ title: "Mind attached", description: `"${mindTitle}" added to your message. Press send when ready.`, duration: 3000 });
  };

  const handleOpenMind = (mindId: string) => {
    // Navigate to the library with the mind pre-selected. The Library
    // page reads ?mindId=… on mount and opens the mind drawer.
    setLocation(`/library?mindId=${encodeURIComponent(mindId)}`);
  };

  const activeView = activeId ? "chat" : "list";

  return (
    <div className="flex h-full max-h-[100dvh] overflow-hidden">
      {/* List Column */}
      <div className={`w-full md:w-80 lg:w-96 border-r border-border/50 flex flex-col ${activeView === "chat" ? "hidden md:flex" : "flex"}`}>
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h1 className="text-xl font-bold">Mentor Channels</h1>
          <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
            <DialogTrigger asChild>
              <Button size="icon" aria-label="Start new conversation" variant="ghost">
                <MessageSquarePlus className="w-5 h-5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Message</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input 
                  placeholder="Enter username to message..." 
                  value={newChatUser}
                  onChange={(e) => setNewChatUser(e.target.value)}
                />
                <Button className="w-full" onClick={handleStartConversation} disabled={isSending || !newChatUser.trim()}>
                  Start Conversation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {combinedConversations.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-4 opacity-20" />
                <p>No conversations yet.</p>
              </div>
            ) : (
              combinedConversations.map((conv) => {
                 const isMind = conv.id.startsWith("mind-");
                 return (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  aria-current={activeId === conv.id ? "true" : undefined}
                  className={`w-full flex items-center gap-3 p-3 rounded-[16px] text-left transition-colors hover:bg-accent/50 ${
                    activeId === conv.id ? "bg-accent" : ""
                  }`}
                >
                  <Avatar className={isMind ? "bg-primary/20 text-primary" : ""}>
                    {isMind ? <BrainCircuit className="w-5 h-5 m-auto" /> : <AvatarFallback>{conv.participantIds.find(id => id !== "me")?.substring(0, 2).toUpperCase() || "??"}</AvatarFallback>}
                  </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-semibold text-sm truncate flex items-center gap-1">
                        {conv.participantIds.find((id: string) => id !== "me") || "User"}
                        {isMind && <span className="text-[10px] text-primary uppercase font-mono tracking-tighter">System Push</span>}
                      </span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                        {formatDistanceToNow(conv.lastMessageAt, { addSuffix: true })}
                      </span>
                    </div>
                    <p className={`text-sm truncate ${isMind ? "text-primary/70 font-mono" : "text-muted-foreground"}`}>{conv.lastMessage}</p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <div className="bg-primary text-primary-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {conv.unreadCount}
                    </div>
                  )}
                </button>
               );
            }))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Column */}
      <div className={`flex-1 flex flex-col bg-background ${activeView === "list" ? "hidden md:flex" : "flex"}`}>
        {activeId ? (
          <>
            <div className="h-16 border-b border-border/50 flex items-center px-4 gap-3">
              <Button size="icon" aria-label="Back to conversation list" variant="ghost" className="md:hidden" onClick={() => setActiveId(null)}>
                 <ArrowLeft className="w-5 h-5" />
              </Button>
              <Avatar className={`w-8 h-8 ${isMindChat ? 'bg-primary/20 text-primary' : ''}`}>
                 {isMindChat ? <BrainCircuit className="w-4 h-4 m-auto" /> : <AvatarFallback>{activeConversation?.participantIds.find((id: string) => id !== "me")?.substring(0, 2).toUpperCase() || "??"}</AvatarFallback>}
              </Avatar>
              <span className="font-semibold">{activeConversation?.participantIds.find((id: string) => id !== "me") || (activeId.startsWith('new-conv') ? "New User" : "User")}</span>
              {isMindChat && <span className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded-md font-mono uppercase tracking-widest ml-2">Mind Push Channel</span>}
            </div>

            {/* Battleground context banner — shown when this conversation was
                started from a shared post. Lets participants jump back to the
                original post while the long-running discussion evolves. */}
            {activeConversation?.originPostId && (
              <button
                type="button"
                onClick={() => setLocation(`/?postId=${encodeURIComponent(activeConversation.originPostId!)}`)}
                className="text-left w-full px-4 py-3 border-b border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors group cursor-pointer"
                aria-label="Open the original post this conversation started from"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <BrainCircuit className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">
                      Battleground context — started from a post by {activeConversation.originPostAuthor || "Unknown"}
                    </div>
                    <p className="text-[13px] text-foreground/80 line-clamp-2 group-hover:text-foreground transition-colors">
                      {activeConversation.originPostSnippet || "View original post"}
                    </p>
                  </div>
                  <span className="text-[12px] text-primary font-semibold shrink-0 self-center group-hover:underline">
                    View →
                  </span>
                </div>
              </button>
            )}
            
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg) => {
                  const isMe = msg.senderId === "me";
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-[16px] px-4 py-2 text-sm ${
                          isMindChat
                            ? "bg-primary/10 text-primary border border-primary/20 font-mono"
                            : isMe
                              ? "bg-primary text-primary-foreground rounded-tr-sm"
                              : "bg-muted text-foreground rounded-tl-sm"
                        }`}
                      >
                        {isMindChat ? msg.content : renderMessageContent(msg.content, handleOpenMind)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            
            <div className="p-4 border-t border-border/50 bg-background">
              {isMindChat ? (
                <div className="text-center text-xs text-muted-foreground font-mono bg-muted/30 p-3 rounded-md">
                   This is an automated cognitive push channel. Replies are disabled.
                </div>
              ) : (
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                  className="flex gap-2"
                >
                  <Button type="button" variant="ghost" size="icon" aria-label="Attach mind" className="shrink-0" onClick={() => handleAction("Attach Mind/Library")}>
                     <BrainCircuit className="w-5 h-5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Attach photo" className="shrink-0" onClick={() => handleAction("Attach Photo")}>
                     <MessageSquare className="w-5 h-5" />
                  </Button>
                  <Input 
                    placeholder="Type a message..." 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" aria-label="Send message" disabled={isSending || !newMessage.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <MessageSquarePlus className="w-12 h-12 mb-4 opacity-20" />
            <p>Select a conversation or start a new one</p>
          </div>
        )}
      </div>

      {/* Mind picker — opens when the user taps the BrainCircuit icon in
          the composer. Replaces the old toast-and-route-away behavior. */}
      <Dialog open={isMindPickerOpen} onOpenChange={setIsMindPickerOpen}>
        <DialogContent className="max-w-md rounded-[20px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-primary" />
              Attach a mind
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 max-h-[60vh] overflow-y-auto -mx-2 px-2 space-y-1">
            {minds.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                You have no minds yet. Create one in the Library first.
              </p>
            ) : (
              minds.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleAttachMind(b.id, b.title)}
                  className="w-full flex items-center gap-3 p-3 rounded-[12px] text-left hover:bg-accent/60 transition-colors border border-transparent hover:border-border/50"
                >
                  <div className="w-9 h-9 rounded-[10px] bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <BrainCircuit className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{b.title}</div>
                    {b.category && (
                      <div className="text-xs text-muted-foreground truncate">{b.category}</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
