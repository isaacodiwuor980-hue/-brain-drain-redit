import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCommunities } from "@/hooks/use-communities";
import { useReputation } from "@/hooks/use-reputation";
import { useAuth } from "@/components/auth/AuthContext";
import { userIdOr, displayNameOr } from "@/lib/user-data";
import { useMessages } from "@/hooks/use-messages";
import { idb } from "@/lib/db";
import { CircleCheckIn, Post } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Search, Shield, Stethoscope, Gamepad2, BookOpen, Activity, MessageCircle, Flame, MessageSquare, Network, Crosshair, Zap, Puzzle, Sprout, Target, Heart, Smile, Star, Award, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic } from "@/lib/device";
import { CreateCircleDialog } from "@/components/community/CreateCircleDialog";
import { CircleRootAdmin } from "@/components/community/CircleRootAdmin";
import { PostCard } from "@/components/feed/PostCard";

function useCheckins() {
  const queryClient = useQueryClient();
  const { data: checkins = [] } = useQuery({
    queryKey: ["checkins"],
    queryFn: () => idb.getAll<CircleCheckIn>("checkins"),
  });
  
  const { mutateAsync: addCheckin } = useMutation({
    mutationFn: async (checkin: CircleCheckIn) => {
      await idb.put("checkins", checkin);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkins"] });
    }
  });

  const { mutateAsync: updateCheckin } = useMutation({
    mutationFn: async (checkin: CircleCheckIn) => {
      await idb.put("checkins", checkin);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkins"] });
    }
  });

  return { checkins, addCheckin, updateCheckin };
}

/**
 * Quora-style toggle vote for circle check-ins — replaces the old
 * always-increment buttons (every tap was +1, up/down stacked, no
 * un-vote). Mirrors togglePostReaction semantics: mutual exclusion,
 * click the active vote again to remove it. My-state lives on the
 * record (myUpvote/myDownvote) since this build is local-first.
 */
function toggleCheckinVote(c: CircleCheckIn, direction: "up" | "down"): CircleCheckIn {
  const up = c.myUpvote ?? false;
  const down = c.myDownvote ?? false;
  const upvotes = c.upvotes ?? 0;
  const downvotes = c.downvotes ?? 0;
  if (direction === "up") {
    if (up) return { ...c, upvotes: Math.max(0, upvotes - 1), myUpvote: false };
    return {
      ...c,
      upvotes: upvotes + 1,
      myUpvote: true,
      downvotes: down ? Math.max(0, downvotes - 1) : downvotes,
      myDownvote: false,
    };
  }
  if (down) return { ...c, downvotes: Math.max(0, downvotes - 1), myDownvote: false };
  return {
    ...c,
    downvotes: downvotes + 1,
    myDownvote: true,
    upvotes: up ? Math.max(0, upvotes - 1) : upvotes,
    myUpvote: false,
  };
}


/**
 * B/C/D: Membership-state-aware button.
 * Renders the correct primary action based on joinStatus + privacy:
 *   not_member + public     → "Join" (immediate)
 *   not_member + restricted  → "Request to join"
 *   not_member + private     → "Invite-only" (disabled)
 *   pending                  → "Cancel request"
 *   member                   → "Joined ✓" + dropdown with "Leave Circle"
 *   restricted               → "Restricted" (disabled)
 */
function MembershipButton({
  community,
  isJoining,
  isLeaving,
  isCancelling,
  onJoin,
  onLeave,
  onCancelRequest,
}: {
  community: { id: string; name: string; privacy?: string; joinStatus?: string };
  isJoining: boolean;
  isLeaving: boolean;
  isCancelling: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onCancelRequest: () => void;
}) {
  const status = community.joinStatus ?? "not_member";
  const privacy = community.privacy ?? "public";
  const busy = isJoining || isLeaving || isCancelling;

  // Stop propagation so clicking the button doesn't open the detail sheet.
  const stop = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation();

  if (status === "member") {
    return (
      <div className="flex gap-1">
        <Button variant="secondary" size="sm" className="flex-1 rounded-full" disabled={busy} onClick={stop}>
          Joined ✓
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full text-muted-foreground hover:text-destructive text-xs px-2"
          disabled={busy || isLeaving}
          onClick={(e) => { stop(e); onLeave(); }}
          title="Leave circle"
        >
          {isLeaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Leave"}
        </Button>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full rounded-full"
        disabled={busy || isCancelling}
        onClick={(e) => { stop(e); onCancelRequest(); }}
      >
        {isCancelling ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
        Cancel request
      </Button>
    );
  }

  if (status === "restricted") {
    return (
      <Button variant="outline" size="sm" className="w-full rounded-full" disabled>
        Restricted
      </Button>
    );
  }

  // not_member
  if (privacy === "private") {
    return (
      <Button variant="outline" size="sm" className="w-full rounded-full" disabled>
        Invite-only
      </Button>
    );
  }

  if (privacy === "restricted") {
    return (
      <Button
        variant="default"
        size="sm"
        className="w-full rounded-full"
        disabled={busy || isJoining}
        onClick={(e) => { stop(e); onJoin(); }}
      >
        {isJoining ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
        Request to join
      </Button>
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      className="w-full rounded-full"
      disabled={busy || isJoining}
      onClick={(e) => { stop(e); onJoin(); }}
    >
      {isJoining ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
      Join
    </Button>
  );
}

export function CommunityPage() {
  const { communities, joinCommunity, leaveCommunity, cancelJoinRequest, isJoining, isLeaving, isCancelling } = useCommunities();
  const { checkins, addCheckin, updateCheckin } = useCheckins();
  const { addXPEvent } = useReputation();
  const { addConversation, addMessage } = useMessages();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  // Phase 2: real user identity.
  const { user } = useAuth();
  const currentUserId = userIdOr(user);
  const currentDisplayName = displayNameOr(user);

  const [search, setSearch] = useState("");

  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null);
  const [checkinMessage, setCheckinMessage] = useState("");
  const [moodScore, setMoodScore] = useState<number>(0);
  const [relayQuestion, setRelayQuestion] = useState("");
  const [relayStatus, setRelayStatus] = useState<"idle" | "orbiting" | "found">("idle");

  // DM composer state — reused by the Connections "Message" buttons, the
  // Purpose-Based Networking "Invite" buttons, and the Mentor tab's
  // "Message / Connect / Offer Help" buttons. Previously every one of these
  // was a dead button. They now all funnel through one composer that creates
  // a conversation + opens the Messages page so the long-running
  // "battleground" discussion can continue there.
  const [dmTarget, setDmTarget] = useState<{ name: string; preset: string } | null>(null);
  const [dmContent, setDmContent] = useState("");
  const [isDmOpen, setIsDmOpen] = useState(false);

  const openDm = (name: string, preset: string) => {
    setDmTarget({ name, preset });
    setDmContent(preset);
    setIsDmOpen(true);
    triggerHaptic("selection");
  };

  const sendDm = async () => {
    if (!dmTarget) return;
    const recipient = dmTarget.name.trim().replace(/^@/, "");
    if (!recipient || !dmContent.trim()) {
      toast({ title: "Message required", description: "Write a message before sending.", variant: "destructive" });
      return;
    }
    try {
      triggerHaptic("success");
      const conversationId = `conv-${crypto.randomUUID()}`;
      await addConversation({
        id: conversationId,
        participantIds: [currentUserId, recipient],
        lastMessage: dmContent.trim(),
        lastMessageAt: Date.now(),
        unreadCount: 0,
      });
      await addMessage({
        id: `msg-${crypto.randomUUID()}`,
        conversationId,
        senderId: currentUserId,
        content: dmContent.trim(),
        createdAt: Date.now(),
      });
      toast({ title: "Message sent", description: `Opening your conversation with ${recipient}…` });
      setIsDmOpen(false);
      setLocation(`/messages?conversationId=${encodeURIComponent(conversationId)}`);
    } catch (error) {
      toast({
        title: "Couldn't send message",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  /**
   * "Invite" / "Connect" — adds the target user to the viewer's local
   * connections graph in IDB and then opens a DM so the relationship can
   * continue. We use a dedicated `connections` IDB store seeded with the
   * schema; the store is best-effort so the action still succeeds even if
   * the store hasn't been created yet (IDB degrades gracefully to a no-op
   * when the object store doesn't exist — we catch that case and surface a
   * softer toast).
   */
  const connectWith = async (name: string, preset: string) => {
    const recipient = name.trim().replace(/^@/, "");
    try {
      // Best-effort persistence — only if the connections store exists.
      try {
        await idb.put("connections", { id: recipient, name: recipient, connectedAt: Date.now() });
      } catch {
        // The connections store may not exist yet on a fresh device — that's
        // fine. The DM still gets created, which is the user-visible action.
      }
      triggerHaptic("success");
      toast({
        title: `Invited ${recipient}`,
        description: "Opening a direct message so you can coordinate.",
      });
      openDm(name, preset);
    } catch (error) {
      toast({
        title: "Couldn't invite",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const launchRelay = () => {
    if (!relayQuestion.trim() || relayStatus === "orbiting") return;
    setRelayStatus("orbiting");
    window.setTimeout(() => {
      setRelayStatus("found");
      toast({ title: "Question sent into orbit", description: "Tagged related subjects. Post launched." });
      window.setTimeout(() => {
        setRelayStatus("idle");
        setRelayQuestion("");
      }, 5000);
    }, 2500);
  };

  const filtered = communities.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.description.toLowerCase().includes(search.toLowerCase())
  );

  const getIcon = (iconName?: string) => {
    switch(iconName) {
      case 'shield': return <Shield className="w-6 h-6" />;
      case 'stethoscope': return <Stethoscope className="w-6 h-6" />;
      case 'gamepad': return <Gamepad2 className="w-6 h-6" />;
      case 'book': return <BookOpen className="w-6 h-6" />;
      default: return <Users className="w-6 h-6" />;
    }
  };

  const handleGlobalCheckIn = async () => {
    if (!moodScore) {
      toast({ title: "Error", description: "Please select a mood", variant: "destructive" });
      return;
    }

    try {
      await addCheckin({
        id: crypto.randomUUID(),
        circleId: "global",
        userId: currentUserId,
        message: checkinMessage,
        moodScore,
        createdAt: Date.now()
      });

      await addXPEvent("check_in", 25, "Daily Momentum Check-In");
      toast({ title: "Checked in!", description: "+25 XP earned for check-in." });
      setCheckinMessage("");
      setMoodScore(0);
    } catch (error) {
      toast({ title: "Check-in failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const handleCircleCheckIn = async (circleId: string) => {
    if (!moodScore) {
      toast({ title: "Error", description: "Please select a mood", variant: "destructive" });
      return;
    }

    try {
      await addCheckin({
        id: crypto.randomUUID(),
        circleId,
        userId: currentUserId,
        message: checkinMessage,
        moodScore,
        createdAt: Date.now()
      });

      await addXPEvent("check_in", 25, "Circle Check-In");
      toast({ title: "Checked in to circle!", description: "+25 XP earned." });
      setCheckinMessage("");
      setMoodScore(0);
    } catch (error) {
      toast({ title: "Check-in failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const todayStr = new Date().toLocaleDateString();
  const todaysGlobalCheckins = checkins.filter(c => 
    c.circleId === "global" && c.userId === currentUserId && 
    new Date(c.createdAt).toLocaleDateString() === todayStr
  ).length;

  const activeComm = communities.find(c => c.id === selectedCommunity);
  const commCheckins = checkins
    .filter(c => c.circleId === selectedCommunity)
    .sort((a, b) => {
      const scoreA = (a.upvotes || 0) - (a.downvotes || 0);
      const scoreB = (b.upvotes || 0) - (b.downvotes || 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return b.createdAt - a.createdAt;
    })
    .slice(0, 5);

  const moodEmojis = [
    { score: 1, emoji: "😴" },
    { score: 2, emoji: "😐" },
    { score: 3, emoji: "🙂" },
    { score: 4, emoji: "😊" },
    { score: 5, emoji: "🚀" }
  ];

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8">
      <Tabs defaultValue="connections" className="w-full">
        <TabsList aria-label="Community sections" className="mb-6 grid w-full grid-cols-2 md:grid-cols-3 max-w-2xl mx-auto">
          <TabsTrigger value="civilization" className="gap-2"><Users className="w-4 h-4"/> Civilization</TabsTrigger>
          <TabsTrigger value="connections" className="gap-2 hidden md:flex"><Network className="w-4 h-4"/> Purpose-Based</TabsTrigger>
          <TabsTrigger value="connections" className="gap-2 md:hidden"><Network className="w-4 h-4"/> Purpose</TabsTrigger>
          <TabsTrigger value="leaderboard" className="gap-2"><Award className="w-4 h-4"/> Leaderboard</TabsTrigger>
        </TabsList>

        <TabsContent value="civilization" className="space-y-8 mt-0">
          {/* Daily Check-In Section */}
          <Card className="bg-gradient-to-r from-card to-card/50 border-primary/20 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1 space-y-4">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <Activity className="w-5 h-5 text-primary" />
                      How's your momentum today?
                    </h2>
                    <p className="text-sm text-muted-foreground">Contribute to the knowledge civilization daily to build your streak.</p>
                  </div>
                  
                  <div className="flex gap-2">
                    {moodEmojis.map(m => (
                      <button
                        key={m.score}
                        onClick={() => setMoodScore(m.score)}
                        className={`text-3xl transition-transform hover:scale-110 p-2 rounded-full ${moodScore === m.score ? 'bg-primary/20 scale-110' : 'grayscale hover:grayscale-0'}`}
                      >
                        {m.emoji}
                      </button>
                    ))}
                  </div>
                  
                  <div className="flex gap-3">
                    <Input 
                      placeholder="What are you focusing on today?" 
                      value={checkinMessage}
                      onChange={(e) => setCheckinMessage(e.target.value)}
                      className="max-w-md"
                    />
                    <Button onClick={handleGlobalCheckIn}>Contribute</Button>
                  </div>
                </div>
                
                <div className="bg-background/50 rounded-[16px] p-4 min-w-[200px] border flex flex-col items-center justify-center text-center">
                  <Flame className="w-8 h-8 text-orange-500 mb-2" />
                  <div className="text-2xl font-bold">{todaysGlobalCheckins > 0 ? "Done!" : "Pending"}</div>
                  <div className="text-sm text-muted-foreground">Today's Contribution</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Civilization Circles</h1>
              <p className="text-muted-foreground mt-1">Join specialized domains, track shared goals, and collaborate.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search civilization..." 
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <CreateCircleDialog />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(community => {
              const count = checkins.filter(c => c.circleId === community.id).length;
              const latest = checkins.filter(c => c.circleId === community.id).sort((a,b) => b.createdAt - a.createdAt)[0];
              
              return (
                <Card 
                  key={community.id} 
                  className="hover:border-primary/50 transition-colors cursor-pointer group flex flex-col h-full"
                  onClick={() => {
                    setSelectedCommunity(community.id);
                    setCheckinMessage("");
                    setMoodScore(0);
                  }}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between mb-2">
                      <div className="p-2 bg-primary/10 text-primary rounded-[16px] group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        {getIcon(community.icon)}
                      </div>
                      {community.active && (
                        <Badge variant="secondary" className="flex items-center gap-1 bg-green-500/10 text-green-500 hover:bg-green-500/20">
                          <Activity className="w-3 h-3" /> Active
                        </Badge>
                      )}
                    </div>
                    <CardTitle>{community.name}</CardTitle>
                    <CardDescription className="line-clamp-2">{community.description}</CardDescription>
                    {/* A: Show relevant tags on the card */}
                    {community.tags && community.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {community.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground">{tag}</span>
                        ))}
                      </div>
                    )}
                  </CardHeader>
                  <div className="flex-grow"></div>
                  <CardContent className="pb-4">
                    {/* B/C/D: Membership-state-aware primary action */}
                    <MembershipButton
                      community={community}
                      isJoining={isJoining}
                      isLeaving={isLeaving}
                      isCancelling={isCancelling}
                      onJoin={() => void joinCommunity(community.id).then(() => {
                        toast({ title: community.privacy === "restricted" ? "Request sent" : "Joined!", description: community.privacy === "restricted" ? `Your request to join ${community.name} is pending approval.` : `You joined ${community.name}.` });
                      }).catch((e) => toast({ title: "Couldn't join", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" }))}
                      onLeave={() => void leaveCommunity(community.id).then(() => {
                        toast({ title: "Left circle", description: `You left ${community.name}. Your posts are preserved.` });
                      }).catch((e) => toast({ title: "Couldn't leave", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" }))}
                      onCancelRequest={() => void cancelJoinRequest(community.id).then(() => {
                        toast({ title: "Request cancelled", description: `Your join request for ${community.name} was withdrawn.` });
                      }).catch((e) => toast({ title: "Couldn't cancel request", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" }))}
                    />
                    <div className="flex items-center text-sm text-muted-foreground font-medium mt-3">
                      <Users className="w-4 h-4 mr-2" />
                      {community.memberCount.toLocaleString()} members
                      {community.privacy && community.privacy !== "public" && (
                        <span className="ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                          {community.privacy === "restricted" ? "Approval required" : "Invite-only"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-t mt-4 pt-4 border-t-border bg-muted/20 -mx-6 px-6 -mb-4 pb-4">
                      <div className="flex items-center">
                        <MessageCircle className="w-3 h-3 mr-1" />
                        {count} contributions
                      </div>
                      {latest && (
                        <div>
                          Active {new Date(latest.createdAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* B: Joined circles quick-access section */}
          {communities.some(c => c.joinStatus === "member") && (
            <div className="mt-8">
              <h3 className="text-lg font-bold mb-3">Your Circles</h3>
              <div className="flex gap-2 flex-wrap">
                {communities.filter(c => c.joinStatus === "member").map(c => (
                  <Button
                    key={c.id}
                    variant="outline"
                    size="sm"
                    className="rounded-full gap-2"
                    onClick={() => { setSelectedCommunity(c.id); }}
                  >
                    {c.name}
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-xs text-muted-foreground hover:text-destructive ml-1"
                      onClick={(e) => { e.stopPropagation(); void leaveCommunity(c.id); toast({ title: "Left circle", description: `You left ${c.name}` }); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void leaveCommunity(c.id); } }}
                    >
                      ✕
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-[16px]">
              <p>No nodes found matching your search.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="connections" className="mt-0 space-y-6">
          <div className="text-center space-y-4 max-w-2xl mx-auto py-12">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6">
              <Network className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Minds to Sync With</h1>
            <p className="text-muted-foreground text-lg">Discover people through knowledge relationships — complementary expertise, conceptual overlap, and shared problem domains. Not vanity metrics.</p>
          </div>

          {/* Phase 7: Cognitive Synapse terminology — the existing user
              cards serve as recommendation cards. The "match" percentage
              is reframed as "Resonance" based on shared topics/missions. */}
          <div className="flex items-center gap-2 px-1 mb-2">
            <span className="text-sm font-bold text-foreground">Establish Synapse</span>
            <span className="text-xs text-muted-foreground">· Recommendations based on knowledge overlap, not follower count</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="p-2 bg-purple-500/10 text-purple-500 rounded-[16px]">
                    <Crosshair className="w-5 h-5" />
                  </div>
                  <Badge variant="outline" className="text-xs">96% Resonance</Badge>
                </div>
                <CardTitle className="mt-4">Sarah Jenkins</CardTitle>
                <CardDescription>Level 24 • Cognitive Psychology</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Target className="w-3 h-3"/> Shared Mission</span>
                    <span className="font-medium text-right ml-2 line-clamp-1">Master Memory Palaces</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Heart className="w-3 h-3"/> Compatible Values</span>
                    <span className="font-medium text-right ml-2 line-clamp-1">Curiosity, Rigor</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Smile className="w-3 h-3"/> Complementary Personality</span>
                    <span className="font-medium text-right ml-2 line-clamp-1">Analytical & Creative</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3"/> Complementary Skill</span>
                    <span className="font-medium text-right ml-2 line-clamp-1">Information Parsing</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <Button className="flex-1" variant="outline" onClick={() => void connectWith("Sarah Jenkins", `Hi Sarah! I'd love to connect — I noticed we share the mission to Master Memory Palaces and I think we'd make a great team.`)}>Invite</Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="flex-1"><MessageSquare className="w-4 h-4 mr-2" /> Message</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Direct Message Sarah Jenkins</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Message</Label>
                          <Textarea
                            defaultValue="Hi Sarah! I saw we have a 96% match and both share the mission to Master Memory Palaces. Would you be interested in coordinating our efforts?"
                            className="min-h-[120px]"
                          />
                        </div>
                        <Button className="w-full" onClick={() => void openDm("Sarah Jenkins", "Hi Sarah! I saw we have a 96% match and both share the mission to Master Memory Palaces. Would you be interested in coordinating our efforts?")}>Send Message</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="p-2 bg-blue-500/10 text-blue-500 rounded-[16px]">
                    <Puzzle className="w-5 h-5" />
                  </div>
                  <Badge variant="outline" className="text-xs">92% Resonance</Badge>
                </div>
                <CardTitle className="mt-4">David Park</CardTitle>
                <CardDescription>Level 18 • Systems Thinking</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Target className="w-3 h-3"/> Shared Mission</span>
                    <span className="font-medium text-right ml-2 line-clamp-1">Build Mental Models</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Heart className="w-3 h-3"/> Compatible Values</span>
                    <span className="font-medium text-right ml-2 line-clamp-1">Efficiency, Logic</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Smile className="w-3 h-3"/> Complementary Personality</span>
                    <span className="font-medium text-right ml-2 line-clamp-1">Structured & Visionary</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3"/> Complementary Skill</span>
                    <span className="font-medium text-right ml-2 line-clamp-1">Data Structuring</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <Button className="flex-1" variant="outline" onClick={() => void connectWith("David Park", `Hi David! I noticed our 92% match. We both have the mission to Build Mental Models and I think my Data Structuring skills could complement your Systems Thinking. Want to connect?`)}>Invite</Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="flex-1"><MessageSquare className="w-4 h-4 mr-2" /> Message</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Direct Message David Park</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Message</Label>
                          <Textarea
                            defaultValue="Hi David! I noticed our 92% match. We both have the mission to Build Mental Models and I think my Data Structuring skills could complement your Systems Thinking. Want to connect?"
                            className="min-h-[120px]"
                          />
                        </div>
                        <Button className="w-full" onClick={() => void openDm("David Park", "Hi David! I noticed our 92% match. We both have the mission to Build Mental Models and I think my Data Structuring skills could complement your Systems Thinking. Want to connect?")}>Send Message</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="p-2 bg-green-500/10 text-green-500 rounded-[16px]">
                    <Sprout className="w-5 h-5" />
                  </div>
                  <Badge variant="outline" className="text-xs">88% Resonance</Badge>
                </div>
                <CardTitle className="mt-4">Elena Rodriguez</CardTitle>
                <CardDescription>Level 31 • Behavioral Science</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Target className="w-3 h-3"/> Shared Mission</span>
                    <span className="font-medium text-right ml-2 line-clamp-1">Habit Formation Loop</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Heart className="w-3 h-3"/> Compatible Values</span>
                    <span className="font-medium text-right ml-2 line-clamp-1">Empathy, Consistency</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Smile className="w-3 h-3"/> Complementary Personality</span>
                    <span className="font-medium text-right ml-2 line-clamp-1">Patient & Driven</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3"/> Complementary Skill</span>
                    <span className="font-medium text-right ml-2 line-clamp-1">Trigger Analysis</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <Button className="flex-1" variant="outline" onClick={() => void connectWith("Elena Rodriguez", `Hi Elena! Given our 88% match and shared mission around the Habit Formation Loop, I'd love to chat. Your Trigger Analysis skills look like exactly what I need right now.`)}>Invite</Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="flex-1"><MessageSquare className="w-4 h-4 mr-2" /> Message</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Direct Message Elena Rodriguez</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Message</Label>
                          <Textarea
                            defaultValue="Hi Elena! Given our 88% match and shared mission around the Habit Formation Loop, I'd love to chat. Your Trigger Analysis skills look like exactly what I need right now."
                            className="min-h-[120px]"
                          />
                        </div>
                        <Button className="w-full" onClick={() => void openDm("Elena Rodriguez", "Hi Elena! Given our 88% match and shared mission around the Habit Formation Loop, I'd love to chat. Your Trigger Analysis skills look like exactly what I need right now.")}>Send Message</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-0 space-y-6">
          <div className="flex flex-col items-center mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight mb-2 flex items-center justify-center gap-3">
              <Award className="w-8 h-8 text-amber-500" />
              Community Leaderboard
            </h2>
            <p className="text-muted-foreground max-w-lg">
              Showcasing our top contributors based on completed 'Real Human Coordination' tasks.
            </p>
          </div>

          <div className="space-y-4 max-w-3xl mx-auto">
            {[
              { rank: 1, name: "Elena R.", level: 42, tasks: 156, points: 14200, role: "Grandmaster" },
              { rank: 2, name: "Marcus T.", level: 38, tasks: 142, points: 12850, role: "Architect" },
              { rank: 3, name: "Sarah J.", level: 35, tasks: 128, points: 11400, role: "Strategist" },
              { rank: 4, name: "David K.", level: 31, tasks: 95, points: 8900, role: "Coordinator" },
              { rank: 5, name: "Aisha M.", level: 28, tasks: 84, points: 7600, role: "Facilitator" },
              { rank: 6, name: "James L.", level: 25, tasks: 72, points: 6100, role: "Builder" },
              { rank: 7, name: "Chloe S.", level: 22, tasks: 65, points: 5400, role: "Builder" },
            ].map((user) => (
              <div 
                key={user.rank} 
                className={`flex items-center justify-between p-4 rounded-[16px] border transition-all hover:scale-[1.01] ${
                  user.rank === 1 ? 'bg-amber-500/10 border-amber-500/50' :
                  user.rank === 2 ? 'bg-slate-300/10 border-slate-400/50' :
                  user.rank === 3 ? 'bg-orange-700/10 border-orange-700/50' :
                  'bg-card border-border hover:border-primary/30'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 flex items-center justify-center font-bold rounded-full ${
                    user.rank === 1 ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30' :
                    user.rank === 2 ? 'bg-slate-300 text-slate-800 shadow-lg shadow-slate-300/30' :
                    user.rank === 3 ? 'bg-orange-700 text-white shadow-lg shadow-orange-700/30' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {user.rank}
                  </div>
                  <Avatar className={user.rank <= 3 ? 'ring-2 ring-primary/20 ring-offset-2 ring-offset-background' : ''}>
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {user.name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {user.name}
                      {user.rank === 1 && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{user.role} • Level {user.level}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-primary">{user.points.toLocaleString()} XP</div>
                  <div className="text-xs text-muted-foreground">{user.tasks} Tasks</div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Community Detail Sidebar */}
      <Sheet open={!!selectedCommunity} onOpenChange={(open) => !open && setSelectedCommunity(null)}>
        <SheetContent className="sm:max-w-md w-full overflow-y-auto">
          {activeComm && (
            <>
              <SheetHeader className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-3 bg-primary/10 text-primary rounded-[16px]">
                    {getIcon(activeComm.icon)}
                  </div>
                  <div>
                    <SheetTitle className="text-2xl">{activeComm.name}</SheetTitle>
                    <SheetDescription className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {activeComm.memberCount.toLocaleString()} members</span>
                      {activeComm.privacy && activeComm.privacy !== "public" && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                          {activeComm.privacy === "restricted" ? "Approval required" : "Invite-only"}
                        </span>
                      )}
                      {activeComm.joinStatus === "member" && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">Member</span>
                      )}
                      {activeComm.joinStatus === "pending" && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600">Pending</span>
                      )}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-6">
                <div className="text-sm">
                  {activeComm.description}
                </div>

                {/* A: Tags in detail view */}
                {activeComm.tags && activeComm.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {activeComm.tags.map((tag) => (
                      <span key={tag} className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">#{tag}</span>
                    ))}
                  </div>
                )}

                {/* B: Membership action in detail view */}
                <div className="pb-2">
                  <MembershipButton
                    community={activeComm}
                    isJoining={isJoining}
                    isLeaving={isLeaving}
                    isCancelling={isCancelling}
                    onJoin={() => void joinCommunity(activeComm.id).then(() => {
                      toast({ title: activeComm.privacy === "restricted" ? "Request sent" : "Joined!", description: activeComm.privacy === "restricted" ? `Your request to join ${activeComm.name} is pending approval.` : `You joined ${activeComm.name}.` });
                    }).catch((e) => toast({ title: "Couldn't join", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" }))}
                    onLeave={() => void leaveCommunity(activeComm.id).then(() => {
                      toast({ title: "Left circle", description: `You left ${activeComm.name}. Your posts are preserved.` });
                    }).catch((e) => toast({ title: "Couldn't leave", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" }))}
                    onCancelRequest={() => void cancelJoinRequest(activeComm.id).then(() => {
                      toast({ title: "Request cancelled", description: `Your join request for ${activeComm.name} was withdrawn.` });
                    }).catch((e) => toast({ title: "Couldn't cancel request", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" }))}
                  />
                </div>
                
                <CircleRootAdmin communityId={activeComm.id} communityName={activeComm.name} />

                {/* E: Participation is gated on membership — non-members can read but not post */}
                {activeComm.joinStatus !== "member" && (
                  <div className="bg-muted/30 border border-border/50 rounded-[16px] p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      {activeComm.joinStatus === "pending"
                        ? "Your join request is pending approval. You can browse but can't post yet."
                        : `Join this circle to participate in discussions and check-ins.`}
                    </p>
                  </div>
                )}

                {activeComm.joinStatus === "member" && (
                <>
                <div className="bg-accent/10 border rounded-[16px] p-4">
                  <label className="text-sm font-semibold mb-2 block">Active Relay (Ask the Circle)</label>
                  <p className="text-xs text-muted-foreground mb-3">Send a question into orbit. The system will find the best member or resource to help you.</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. Can someone review my React architecture?"
                      className="bg-background"
                      value={relayQuestion}
                      onChange={(e) => setRelayQuestion(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") launchRelay(); }}
                      disabled={relayStatus === "orbiting"}
                    />
                    <Button
                      onClick={launchRelay}
                      disabled={!relayQuestion.trim() || relayStatus === "orbiting"}
                      className={relayStatus === "found" ? "bg-green-600 text-white hover:bg-green-700" : ""}
                    >
                      {relayStatus === "orbiting" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {relayStatus === "orbiting" ? "Orbiting..." : relayStatus === "found" ? "✔ Resource Found" : "Launch"}
                    </Button>
                  </div>

                  <div className={`mt-4 p-4 border border-green-500/30 bg-green-500/10 rounded-[16px] space-y-3 animate-in fade-in slide-in-from-top-2 ${relayStatus === "found" ? "block" : "hidden"}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-green-600 dark:text-green-400 flex items-center gap-2">
                        ✔ Resource Found
                      </div>
                      <Badge variant="outline" className="text-xs border-green-500/30">Similarity: 94%</Badge>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">From:</span> Sarah J.
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button size="sm" variant="default" className="text-xs h-7" onClick={() => toast({ title: "Opening resource…", description: "Tagged as a 94% similarity match — opening in a new view." })}>Open Resource</Button>
                      <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => toast({ title: "Routing", description: "3-hop path to Sarah J. computed. Opening the relay trace…" })}>View Route (3 hops)</Button>
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => void connectWith("Sarah J.", `Hi Sarah J.! I found your resource via the ${activeComm?.name || "circle"} relay — I'd love to discuss it further.`)}>Send Message</Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2 border-b pb-2">
                    <Activity className="w-4 h-4" /> Check In
                  </h4>
                  
                  <div className="flex justify-center gap-3 mb-4">
                    {moodEmojis.map(m => (
                      <button
                        key={m.score}
                        onClick={() => setMoodScore(m.score)}
                        className={`text-2xl transition-transform hover:scale-110 p-2 rounded-full ${moodScore === m.score ? 'bg-primary/20 scale-110' : 'grayscale hover:grayscale-0'}`}
                      >
                        {m.emoji}
                      </button>
                    ))}
                  </div>
                  <Input 
                    placeholder="Update the circle on your progress..."
                    value={checkinMessage}
                    onChange={e => setCheckinMessage(e.target.value)}
                  />
                  <Button className="w-full" onClick={() => handleCircleCheckIn(activeComm.id)}>
                    Post Check-In
                  </Button>
                </div>
                </>)} {/* end member-only participation */}

                <div className="space-y-4 mt-8">
                  <h4 className="font-semibold flex items-center gap-2 border-b pb-2">
                    <MessageCircle className="w-4 h-4" /> Recent Activity
                  </h4>
                  
                  {commCheckins.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No check-ins yet. Be the first!</p>
                  ) : (
                    <div className="space-y-4">
                      {/* Task 15: render check-ins with the SAME PostCard format
                          as the main feed. Each check-in is converted to a Post
                          object so it gets the same card structure, reactions,
                          comments, share menu, etc. as feed posts. */}
                      {commCheckins.map(c => {
                        const moodEmoji = moodEmojis.find((m) => m.score === c.moodScore)?.emoji || "😐";
                        const post: Post = {
                          id: `checkin-${c.id}`,
                          userId: c.userId,
                          topicId: c.circleId || "community",
                          content: `${moodEmoji} ${c.message || "Checked in"}`,
                          postType: "post",
                          reactions: {
                            upvote: c.upvotes || 0,
                            downvote: c.downvotes || 0,
                            repost: 0,
                          },
                          userReactions: c.myUpvote
                            ? { upvote: [currentUserId] }
                            : c.myDownvote
                              ? { downvote: [currentUserId] }
                              : {},
                          commentCount: c.replies?.length || 0,
                          repostCount: 0,
                          createdAt: c.createdAt,
                          authorName: c.userId === currentUserId ? currentDisplayName : c.userId,
                          communityId: c.circleId,
                          communityName: communities.find((cm) => cm.id === c.circleId)?.name,
                        };
                        return (
                          <PostCard
                            key={c.id}
                            post={post}
                            onReact={(_postId: string, type: string) => {
                              // Check-in votes must update the CHECKIN record —
                              // reactToPost would idb.get("posts", …) and throw
                              // POST_NOT_FOUND for every check-in card.
                              if (type !== "upvote" && type !== "downvote") return;
                              void Promise.resolve(
                                updateCheckin(toggleCheckinVote(c, type === "upvote" ? "up" : "down")),
                              ).catch((error: unknown) =>
                                toast({ title: "Couldn't update check-in", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" })
                              );
                            }}
                            authorName={post.authorName}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/*
        Shared DM composer — opened by any of the Invite / Message / Connect /
        Offer Help buttons on this page. On submit, creates a conversation +
        first message in IDB, then routes the user to the Messages page so
        the long-running discussion can continue there. This is the
        "battleground" surface the user wants for long engagement.
      */}
      <Dialog open={isDmOpen} onOpenChange={setIsDmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Direct message {dmTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Textarea
              value={dmContent}
              onChange={(e) => setDmContent(e.target.value)}
              rows={5}
              className="resize-none"
              placeholder={`Write to ${dmTarget?.name ?? "…"}…`}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsDmOpen(false)}>Cancel</Button>
              <Button onClick={() => void sendDm()} disabled={!dmContent.trim()}>Send &amp; open chat</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
