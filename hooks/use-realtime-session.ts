import { useState, useEffect, useCallback } from "react";
import { RealtimeSession, RealtimeSessionParticipant, LiveMediaMode, LiveChatMessage } from "../lib/extension-types";
import { idb } from "../lib/db";
import { trackEvent } from "../lib/analytics";
import { useAuth } from "@/components/auth/AuthContext";
import { userIdOr, displayNameOr } from "@/lib/user-data";

// Monotonic request id shared across all useRealtimeSession instances in
// this JS context. The most recent fetch wins; older fetches short-circuit
// their setState calls.
let activeRequestId = 0;

// Simple in-memory chat rate limit: max 5 messages per 10 seconds per user.
// Prevents chat spam in the local-only demo. Real deployment would do this
// server-side.
const CHAT_RATE_LIMIT = { max: 5, windowMs: 10_000 };
const chatTimestamps = new Map<string, number[]>();

export function useRealtimeSession(sessionId: string | null) {
  const [session, setSession] = useState<RealtimeSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Phase 2: real user ID + display name for session participants.
  const { user } = useAuth();
  const currentUserId = userIdOr(user);
  const currentDisplayName = displayNameOr(user);

  const fetchSession = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    // Each fetch gets a unique request id; if a newer fetch starts before this
    // one resolves, the older one's setState calls are skipped. Prevents
    // stale responses overwriting fresher state when sessionId changes
    // rapidly (e.g. user clicks back/forward quickly).
    const requestId = ++activeRequestId;
    try {
      if (requestId === activeRequestId) setIsLoading(true);
      if (requestId === activeRequestId) setError(null);
      const stored = await idb.get<RealtimeSession>("realtime_sessions", sessionId);
      if (requestId !== activeRequestId) return; // superseded
      if (stored) {
        setSession(stored);
      } else {
        const fallback: RealtimeSession = {
          id: sessionId,
          title: "Live Brain Synthesis Session",
          brainId: "brain-1",
          hostUserId: currentUserId,
          status: "active",
          activeNodeId: "root",
          participants: {
            me: {
              userId: currentUserId,
              displayName: currentDisplayName,
              role: "host",
              joinedAt: Date.now(),
              currentNodeId: "root",
              canSpeak: true,
              isMuted: false,
            },
          },
          mediaMode: "idle",
          chatMessages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await idb.put("realtime_sessions", fallback);
        if (requestId !== activeRequestId) return; // superseded
        setSession(fallback);
      }
    } catch (err: unknown) {
      if (requestId !== activeRequestId) return; // superseded
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load real-time session");
    } finally {
      if (requestId === activeRequestId) setIsLoading(false);
    }
  }, [sessionId, currentDisplayName, currentUserId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate session lifecycle: load the real-time session from IDB on mount / sessionId change; refactoring to derived state would change behavior (fetchSession drives async IDB reads + error/loading state).
    fetchSession();
  }, [fetchSession]);

  const persist = async (updated: RealtimeSession) => {
    await idb.put("realtime_sessions", updated);
    setSession(updated);
  };

  const joinSession = async (participant: RealtimeSessionParticipant) => {
    if (!session) return;
    const updated: RealtimeSession = {
      ...session,
      participants: {
        ...session.participants,
        [participant.userId]: participant,
      },
      chatMessages: [
        ...(session.chatMessages ?? []),
        {
          id: `sys-${crypto.randomUUID()}`,
          senderId: "system",
          senderName: "System",
          content: `${participant.displayName} joined the session.`,
          createdAt: Date.now(),
          isSystem: true,
        },
      ],
      updatedAt: Date.now(),
    };
    await persist(updated);
    void trackEvent("live_session_joined", { sessionId: session.id, userId: participant.userId });
  };

  const navigateNode = async (nodeId: string) => {
    if (!session) return;
    const updated: RealtimeSession = {
      ...session,
      activeNodeId: nodeId,
      updatedAt: Date.now(),
    };
    await persist(updated);
  };

  /**
   * Switches the host's active media source. Only ONE mode can be active
   * at a time (browser limitation: getDisplayMedia and getUserMedia can't
   * both run cleanly). Switching stops the previous stream and starts the
   * new one.
   *
   * The actual MediaStream capture happens in the RealtimeSessionView
   * component (it owns the <video> / <audio> refs). This hook just
   * records the intent so all participants see the same mode.
   */
  const setMediaMode = async (mode: LiveMediaMode, peerScreenSharerId?: string) => {
    if (!session) return;
    const updated: RealtimeSession = {
      ...session,
      mediaMode: mode,
      peerScreenSharerId: mode === "peer-screen" ? peerScreenSharerId : undefined,
      updatedAt: Date.now(),
    };
    await persist(updated);
  };

  /**
   * Grants microphone permission to a participant. Host only.
   * The participant can then unmute themselves and speak.
   */
  const grantMic = async (participantId: string, granted: boolean) => {
    if (!session) return;
    const participant = session.participants[participantId];
    if (!participant) return;
    const updated: RealtimeSession = {
      ...session,
      participants: {
        ...session.participants,
        [participantId]: {
          ...participant,
          canSpeak: granted,
          // Revoking permission also forces mute.
          isMuted: granted ? participant.isMuted : true,
        },
      },
      chatMessages: [
        ...(session.chatMessages ?? []),
        {
          id: `sys-${crypto.randomUUID()}`,
          senderId: "system",
          senderName: "System",
          content: granted
            ? `${participant.displayName} was granted microphone access.`
            : `${participant.displayName}'s microphone access was revoked.`,
          createdAt: Date.now(),
          isSystem: true,
        },
      ],
      updatedAt: Date.now(),
    };
    await persist(updated);
    if (granted) {
      void trackEvent("live_session_mic_granted", { sessionId: session.id, participantId });
    }
  };

  /**
   * Self-mute toggle. A participant with canSpeak=true can mute/unmute
   * themselves. A participant without canSpeak cannot unmute.
   */
  const setMuted = async (participantId: string, muted: boolean) => {
    if (!session) return;
    const participant = session.participants[participantId];
    if (!participant) return;
    if (!participant.canSpeak && !muted) {
      throw new Error("You don't have microphone permission. Ask the host to grant it.");
    }
    const updated: RealtimeSession = {
      ...session,
      participants: {
        ...session.participants,
        [participantId]: { ...participant, isMuted: muted },
      },
      updatedAt: Date.now(),
    };
    await persist(updated);
  };

  /**
   * Sends a chat message. Rate-limited per user (5 msgs / 10s) to prevent
   * spam in the local-only demo. System messages bypass the limit.
   */
  const sendChat = async (senderId: string, senderName: string, content: string) => {
    if (!session) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    if (trimmed.length > 500) {
      throw new Error("Message too long (max 500 chars).");
    }
    // Rate limit check.
    const now = Date.now();
    const recent = (chatTimestamps.get(senderId) ?? []).filter(t => now - t < CHAT_RATE_LIMIT.windowMs);
    if (recent.length >= CHAT_RATE_LIMIT.max) {
      throw new Error("You're sending messages too fast. Wait a moment.");
    }
    recent.push(now);
    chatTimestamps.set(senderId, recent);

    const msg: LiveChatMessage = {
      id: `msg-${crypto.randomUUID()}`,
      senderId,
      senderName,
      content: trimmed,
      createdAt: now,
    };
    const updated: RealtimeSession = {
      ...session,
      chatMessages: [...(session.chatMessages ?? []), msg],
      updatedAt: now,
    };
    await persist(updated);
  };

  return {
    session,
    isLoading,
    error,
    joinSession,
    navigateNode,
    setMediaMode,
    grantMic,
    setMuted,
    sendChat,
    refresh: fetchSession,
  };
}
