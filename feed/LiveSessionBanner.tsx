import { useState } from "react";
import { useActiveSessions } from "@/hooks/use-active-sessions";
import { RealtimeSession } from "@/lib/extension-types";
import { Button } from "@/ui/button";
import { Avatar, AvatarFallback } from "@/ui/avatar";
import { Users, ChevronRight, Plus, Video } from "lucide-react";
import { triggerHaptic } from "@/lib/device";
import { useAuth } from "@/components/auth/AuthContext";
import { userIdOr, displayNameOr } from "@/lib/user-data";
import { RealtimeSessionView } from "@/runtime/RealtimeSessionView";
import { idb } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";

export function LiveSessionBanner() {
  const { sessions, isLoading } = useActiveSessions();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const { toast } = useToast();
  // Phase 2: real user identity.
  const { user } = useAuth();
  const currentUserId = userIdOr(user);
  const currentDisplayName = displayNameOr(user);

  const handleHostNewSession = async () => {
    triggerHaptic("selection");
    try {
      const newSessionId = `session-${Date.now()}`;
      const newSession: RealtimeSession = {
        id: newSessionId,
        title: "My Live Session",
        // FRAG-1: removed mindId — live sessions are now standalone.
        mindId: "",
        hostUserId: currentUserId,
        status: "active",
        activeNodeId: "",
        participants: {
          "me": {
            userId: currentUserId,
            displayName: `${currentDisplayName} (Host)`,
            role: "host",
            joinedAt: Date.now(),
            canSpeak: true,
            isMuted: false,
          }
        },
        mediaMode: "idle",
        chatMessages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await idb.put("realtime_sessions", newSession);
      setActiveSessionId(newSessionId);
      void trackEvent("live_session_started", { sessionId: newSessionId });
    } catch (error) {
      toast({ title: "Couldn't start session", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  if (isLoading) return null;

  const hostOf = (session: RealtimeSession) =>
    Object.values(session.participants).find((p) => p.role === "host");

  return (
    <>
      <section
        id="live-session-banner-container"
        aria-label="Live sessions"
        className="rounded-xl border border-border/50 bg-background/50 overflow-hidden"
      >
        {/* Header — compact, professional. Primary color for the host action
            (red was alarming and read as "delete"). */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Live Sessions</h3>
            {sessions.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {sessions.length}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleHostNewSession}
            className="h-7 px-2.5 text-xs border-primary/40 text-primary hover:bg-primary/10"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Host
          </Button>
        </div>

        {sessions.length === 0 ? (
          <div className="px-4 py-5 text-center">
            <p className="text-xs text-muted-foreground">
              No live sessions right now. Host one to collaborate in real time.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/30">
            {sessions.map((session) => {
              const host = hostOf(session);
              const viewerCount = Object.keys(session.participants).length;
              return (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      setActiveSessionId(session.id);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors group"
                  >
                    {/* Host avatar — gives the row a face, FB-style */}
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                        {(host?.displayName || "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Live badge stays red — it's the universal live signal */}
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                          </span>
                          Live
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Users className="w-3 h-3" />
                          {viewerCount} watching
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {session.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Hosted by {host?.displayName || "Unknown"}
                      </p>
                    </div>

                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {activeSessionId && (
        <RealtimeSessionView
          sessionId={activeSessionId}
          onClose={() => setActiveSessionId(null)}
        />
      )}
    </>
  );
}
