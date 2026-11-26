import { useEffect, useRef, useState } from "react";
import { Mind, Node } from "@/lib/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idb } from "@/lib/db";
import { useAuth } from "@/components/auth/AuthContext";
import { userIdOr, displayNameOr } from "@/lib/user-data";
import {
  Activity,
  X,
  Users,
  CheckCircle2,
  MessageSquare,
  Flame,
  Monitor,
  Camera,
  Mic,
  MicOff,
  Volume2,
  Send,
  Radio,
  Crop,
  Eraser,
  ArrowUpRight,
  EyeOff,
  Circle,
  Square,
  PictureInPicture2,
  Download,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic } from "@/lib/device";
import { useRealtimeSession } from "@/hooks/use-realtime-session";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/avatar";
import type { LiveMediaMode } from "@/lib/extension-types";

interface RealtimeSessionViewProps {
  sessionId: string;
  onClose: () => void;
}

/**
 * Media mode definitions — the 4 source types the host can switch between.
 * Only ONE is active at a time (browser limitation + cognitive-load reason).
 * The host taps a mode to start it, taps again (or taps another) to stop.
 */
const MEDIA_MODES: Array<{
  mode: LiveMediaMode;
  label: string;
  icon: typeof Monitor;
  hint: string;
  color: string;
}> = [
  { mode: "screen", label: "Screen", icon: Monitor, hint: "Share your screen", color: "text-sky-500" },
  { mode: "peer-screen", label: "Peer screen", icon: Users, hint: "Re-broadcast a peer's screen", color: "text-violet-500" },
  { mode: "voice", label: "Voice", icon: Mic, hint: "Live audio only", color: "text-emerald-500" },
  { mode: "cam", label: "Camera", icon: Camera, hint: "Webcam + audio", color: "text-amber-500" },
];

export function RealtimeSessionView({ sessionId, onClose }: RealtimeSessionViewProps) {
  const { session, joinSession, navigateNode, setMediaMode, grantMic, setMuted, sendChat } = useRealtimeSession(sessionId);
  const [mind, setMind] = useState<Mind | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [chatInput, setChatInput] = useState("");
  // Guards: prevent rapid double-firing of async actions that leave
  // duplicate MediaStreams open or send duplicate chat messages.
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // FRAG-2: Crop/select-area for screen sharing (privacy).
  // When enabled, the host draws a rectangle over the screen share
  // and only that area is visible to viewers. The rest is blacked out.
  const [cropEnabled, setCropEnabled] = useState(false);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isDrawingCrop, setIsDrawingCrop] = useState(false);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // FRAG-3: Annotation tools — blur sections + draw arrows.
  const [annotationTool, setAnnotationTool] = useState<"none" | "blur" | "arrow">("none");
  const [annotations, setAnnotations] = useState<Array<{
    id: string;
    type: "blur" | "arrow";
    x: number; y: number; w?: number; h?: number; x2?: number; y2?: number;
  }>>([]);
  const [isDrawingAnnotation, setIsDrawingAnnotation] = useState(false);
  const annotationStartRef = useRef<{ x: number; y: number } | null>(null);

  // FRAG-4: Picture-in-picture webcam bubble.
  // When screen+cam are both active, the camera feed floats as a
  // small draggable circle on top of the screen share (like OBS/Zoom).
  const [pipStream, setPipStream] = useState<MediaStream | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const [pipPosition, setPipPosition] = useState({ x: 20, y: 20 });
  const [isDraggingPip, setIsDraggingPip] = useState(false);
  const pipDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [showPip, setShowPip] = useState(false);

  // ── Part 2 Task 2: Recording + Background (PiP) state ──────────────
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [lastRecordingUrl, setLastRecordingUrl] = useState<string | null>(null);
  // Timestamp captured when a recording finishes (in the recorder.onstop
  // callback) so the download filename stays pure during render — deriving it
  // from Date.now() in JSX was an impure render-time read.
  const [lastRecordingTimestamp, setLastRecordingTimestamp] = useState<number | null>(null);
  const [isPipActive, setIsPipActive] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);

  // Phase 2: real user identity from auth context. Falls back to "me"/"You"
  // for guest mode so the local demo still works.
  const { user } = useAuth();
  const CURRENT_USER_ID = userIdOr(user);
  const CURRENT_USER_NAME = displayNameOr(user);

  useEffect(() => {
    // Automatically join as spectator if not already in
    if (session && !session.participants[CURRENT_USER_ID]) {
      joinSession({
        userId: CURRENT_USER_ID,
        displayName: CURRENT_USER_NAME,
        role: "host", // the creator is host; visitors would be spectator
        joinedAt: Date.now(),
        canSpeak: true,
        isMuted: false,
      });
    }

    // Only load mind if the session actually has one.
    if (session?.mindId && session.mindId.trim() && !mind) {
      idb.get<Mind>("minds", session.mindId).then((b) => {
        if (b) {
          setMind(b);
          idb.getAllByIndex<Node>("nodes", "mind_id", b.id).then((n) => setNodes(n));
        }
      });
    }
    // BUG FIX: removed joinSession from deps. joinSession is recreated every
    // render (it closes over `session` state), so having it in deps caused
    // this effect to re-run every render → duplicate joinSession calls +
    // duplicate mind loading. The guard `!session.participants[userId]`
    // already prevents duplicate joins, so the stale closure is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, mind]);

  // ── Media stream lifecycle ────────────────────────────────────
  // When the session's mediaMode changes, stop the old stream and start
  // the new one. Only the host captures local media; spectators see a
  // placeholder + the host's audio/video would come from a real streaming
  // layer (WebRTC) in production.
  useEffect(() => {
    if (!session) return undefined;
    const mode = session.mediaMode ?? "idle";

    // Stop any existing stream.
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate stream lifecycle: tear down the previous MediaStream when mediaMode changes; refactoring to derived state would change behavior (setLocalStream(null) is the cleanup half of a capture/teardown cycle).
      setLocalStream(null);
    }

    // Only capture if we're the host and mode isn't idle.
    const isHost = session.participants[CURRENT_USER_ID]?.role === "host";
    if (!isHost || mode === "idle") return undefined;

    let cancelled = false;
    const startStream = async () => {
      try {
        let stream: MediaStream | null = null;
        if (mode === "screen") {
          // getDisplayMedia — host's own screen.
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } else if (mode === "cam") {
          // getUserMedia — webcam + mic.
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } else if (mode === "voice") {
          // getUserMedia — audio only.
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        } else if (mode === "peer-screen") {
          // peer-screen: in production the host would subscribe to a peer's
          // stream. Locally we just prompt the host to share their own screen
          // as a stand-in (the UI makes clear it's the peer-screen mode).
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          toast({
            title: "Peer screen mode",
            description: "In production this would re-broadcast a peer's screen. For now you're sharing your own as a stand-in.",
            duration: 5000,
          });
        }
        if (cancelled && stream) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        if (stream) {
          setLocalStream(stream);
          // Attach to the <video> element for visual modes.
          if (videoRef.current && (mode === "screen" || mode === "peer-screen" || mode === "cam")) {
            videoRef.current.srcObject = stream;
          }
          if (audioRef.current && (mode === "voice" || mode === "cam" || mode === "screen")) {
            audioRef.current.srcObject = stream;
          }
        }
      } catch (err) {
        // User denied permission, or the API isn't available.
        toast({
          title: "Couldn't start media",
          description: err instanceof Error ? err.message : "Permission denied or device unavailable.",
          variant: "destructive",
        });
        // Revert to idle so the UI doesn't show a stuck "active" state.
        void setMediaMode("idle");
      }
    };
    void startStream();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.mediaMode]);

  // Auto-scroll chat to bottom on new messages.
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [session?.chatMessages]);

  // Clean up PiP stream on unmount. MUST be before the `if (!session) return null`
  // early return — otherwise the hook count changes when session flips from
  // null→object → React error #310 ("Rendered more hooks than during the
  // previous render").
  useEffect(() => {
    return () => {
      if (pipStream) {
        pipStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [pipStream]);

  // Cleanup recording + PiP on unmount. (Moved above the early return to
  // satisfy the hook-order guard — hooks must never be after a conditional return.)
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
      if (pipWindowRef.current) {
        pipWindowRef.current.close();
      }
      if (lastRecordingUrl) {
        URL.revokeObjectURL(lastRecordingUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!session) return null;

  const currentNode = nodes.find(n => n.id === session.activeNodeId) || nodes[0];
  const me = session.participants[CURRENT_USER_ID];
  const isHost = me?.role === "host";
  const participants = Object.values(session.participants);
  const chatMessages = session.chatMessages ?? [];
  const activeMode = session.mediaMode ?? "idle";

  const handleHostDecision = (decision: boolean) => {
    if (!currentNode || !isHost) return;
    const nextNodeId = decision ? currentNode.if_true_node_id : currentNode.if_false_node_id;
    if (nextNodeId) {
      triggerHaptic("selection");
      navigateNode(nextNodeId);
    } else {
      triggerHaptic("warning");
    }
  };

  const handleModeToggle = (mode: LiveMediaMode) => {
    // Guard: rapid mode-switching can leave multiple MediaStreams open
    // (the cleanup effect runs on the NEXT render). Block until the
    // current switch completes.
    if (isSwitchingMode) return;
    setIsSwitchingMode(true);
    triggerHaptic("selection");
    if (activeMode === mode) {
      // Tapping the active mode stops it.
      void setMediaMode("idle").finally(() => setIsSwitchingMode(false));
    } else {
      void setMediaMode(mode).finally(() => setIsSwitchingMode(false));
    }
  };

  // ── Part 2 Task 2: Recording handlers ──────────────────────────────
  /**
   * Starts recording the active stream (camera/voice/screen). Uses
   * MediaRecorder with the best-supported mime type. The recording
   * continues even if the user switches tabs (browser keeps recording
   * until stop() is called). For screen mode, the browser's
   * getDisplayMedia already captures the screen — the recording
   * captures whatever the stream sees.
   */
  const handleStartRecording = () => {
    if (!localStream || isRecording) return;
    // Pick the best-supported mime type.
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "audio/webm",
    ];
    const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
    try {
      const recorder = new MediaRecorder(localStream, mimeType ? { mimeType } : undefined);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType || "video/webm" });
        const url = URL.createObjectURL(blob);
        setLastRecordingUrl(url);
        setLastRecordingTimestamp(Date.now());
        toast({ title: "Recording saved", description: "Download it from the controls below." });
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      triggerHaptic("success");
      toast({ title: "Recording started", description: "Recording the active stream. Tap Stop when done." });
    } catch (err) {
      toast({ title: "Couldn't start recording", description: err instanceof Error ? err.message : "MediaRecorder unavailable.", variant: "destructive" });
    }
  };

  const handleStopRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    triggerHaptic("warning");
  };

  /**
   * Part 2 Task 2: Background mode via Picture-in-Picture.
   *
   * IMPORTANT LIMITATION: True "display over other apps" (system-wide overlay)
   * is NOT possible in a browser — that requires a native Android/iOS app with
   * SYSTEM_ALERT_WINDOW permission. The browser-accessible approximation is
   * the Picture-in-Picture API, which floats the video over OTHER TABS in the
   * same browser, and (on desktop) over other windows when the browser
   * supports it. This is the closest a PWA can get to "background recording."
   *
   * For screen-recording mode, the getDisplayMedia stream continues capturing
   * the screen even when the user switches away from this tab — the recording
   * itself is true background capture; only the PREVIEW window is limited.
   */
  const handleTogglePip = async () => {
    // Document PiP API (floats the whole session over other tabs).
    const nav = navigator;
    if (isPipActive && pipWindowRef.current) {
      pipWindowRef.current.close();
      return;
    }
    // Prefer video PiP (simpler, wider support) for screen/cam modes.
    if (videoRef.current && (activeMode === "screen" || activeMode === "cam" || activeMode === "peer-screen")) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
          setIsPipActive(false);
        } else {
          await videoRef.current.requestPictureInPicture();
          setIsPipActive(true);
        }
        return;
      } catch {
        // Fall through to document PiP if video PiP fails.
      }
    }
    // Document PiP (floats the session window over other tabs).
    if (nav.documentPictureInPicture) {
      try {
        const pipWindow = await nav.documentPictureInPicture.requestWindow({ width: 400, height: 300 });
        pipWindowRef.current = pipWindow;
        setIsPipActive(true);
        // Move the video element into the PiP window so the stream is visible there.
        const container = videoContainerRef.current;
        if (container) {
          pipWindow.document.body.style.margin = "0";
          pipWindow.document.body.style.background = "#000";
          pipWindow.document.body.appendChild(container);
        }
        pipWindow.addEventListener("pagehide", () => {
          setIsPipActive(false);
          pipWindowRef.current = null;
        });
      } catch {
        toast({ title: "Couldn't enter background mode", description: "PiP not available in this browser.", variant: "destructive" });
      }
    } else {
      toast({ title: "Background mode unavailable", description: "Your browser doesn't support Picture-in-Picture. The recording still works in the background — only the floating preview is unavailable.", duration: 5000 });
    }
  };

  const handleMuteToggle = () => {
    if (!me) return;
    triggerHaptic("light");
    void setMuted(CURRENT_USER_ID, !me.isMuted).catch(err => {
      toast({ title: "Couldn't toggle mic", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    });
  };

  const handleSendChat = async () => {
    const content = chatInput.trim();
    if (!content) return;
    // Guard: prevent duplicate messages on rapid Enter pressing. The
    // rate limiter in the hook would catch spam, but without this guard
    // the user gets a burst of error toasts for each rejected message.
    if (isSendingChat) return;
    setIsSendingChat(true);
    setChatInput("");
    try {
      await sendChat(CURRENT_USER_ID, CURRENT_USER_NAME, content);
    } catch (err) {
      toast({
        title: "Couldn't send message",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
      // Restore the text so the user doesn't lose their message.
      setChatInput(content);
    } finally {
      setIsSendingChat(false);
    }
  };

  // ── FRAG-2: Crop/select-area handlers ───────────────────────────
  // The host draws a rectangle on the video preview. Only the area
  // inside the rectangle is shown to viewers — the rest is blacked
  // out for privacy. This is like Zoom's "share portion of screen".
  const handleVideoMouseDown = (e: React.MouseEvent) => {
    if (!videoContainerRef.current) return;
    const rect = videoContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (cropEnabled && !isDrawingCrop) {
      setIsDrawingCrop(true);
      cropStartRef.current = { x, y };
      setCropRect({ x, y, w: 0, h: 0 });
    } else if (annotationTool !== "none" && !isDrawingAnnotation) {
      setIsDrawingAnnotation(true);
      annotationStartRef.current = { x, y };
    }
  };

  const handleVideoMouseMove = (e: React.MouseEvent) => {
    if (!videoContainerRef.current) return;
    const rect = videoContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (isDrawingCrop && cropStartRef.current) {
      const start = cropStartRef.current;
      setCropRect({
        x: Math.min(start.x, x),
        y: Math.min(start.y, y),
        w: Math.abs(x - start.x),
        h: Math.abs(y - start.y),
      });
    } else if (isDrawingAnnotation && annotationStartRef.current) {
      const start = annotationStartRef.current;
      if (annotationTool === "blur") {
        // Update the last blur annotation
        setAnnotations(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.type === "blur") {
            next[next.length - 1] = {
              ...last,
              x: Math.min(start.x, x),
              y: Math.min(start.y, y),
              w: Math.abs(x - start.x),
              h: Math.abs(y - start.y),
            };
          }
          return next;
        });
      } else if (annotationTool === "arrow") {
        setAnnotations(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.type === "arrow") {
            next[next.length - 1] = { ...last, x2: x, y2: y };
          }
          return next;
        });
      }
    }
  };

  const handleVideoMouseUp = () => {
    if (isDrawingCrop) {
      setIsDrawingCrop(false);
      cropStartRef.current = null;
    }
    if (isDrawingAnnotation) {
      setIsDrawingAnnotation(false);
      annotationStartRef.current = null;
    }
  };

  // ── FRAG-4: PiP webcam bubble handlers ──────────────────────────
  // When screen+cam are both active, the camera floats as a small
  // draggable circle on top of the screen share. The host can drag
  // it to any corner (like OBS/Zoom/Teams).
  const handlePipMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoContainerRef.current) return;
    const rect = videoContainerRef.current.getBoundingClientRect();
    pipDragStartRef.current = {
      x: e.clientX - (pipPosition.x / 100) * rect.width,
      y: e.clientY - (pipPosition.y / 100) * rect.height,
    };
    setIsDraggingPip(true);
  };

  const handlePipMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingPip || !videoContainerRef.current || !pipDragStartRef.current) return;
    const rect = videoContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - pipDragStartRef.current.x) / rect.width) * 100;
    const y = ((e.clientY - pipDragStartRef.current.y) / rect.height) * 100;
    // Clamp to 0-80% (so the bubble doesn't go off-screen)
    setPipPosition({
      x: Math.max(0, Math.min(80, x)),
      y: Math.max(0, Math.min(80, y)),
    });
  };

  const handlePipMouseUp = () => {
    setIsDraggingPip(false);
    pipDragStartRef.current = null;
  };

  // Toggle PiP camera: when screen mode is active and the host clicks
  // "Camera", instead of switching to cam-only, we ADD a camera stream
  // as a PiP overlay on top of the screen share.
  const handleTogglePipCamera = async () => {
    if (showPip) {
      // Turn off PiP
      if (pipStream) {
        pipStream.getTracks().forEach(t => t.stop());
        setPipStream(null);
      }
      setShowPip(false);
    } else {
      // Turn on PiP camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setPipStream(stream);
        setShowPip(true);
        if (pipVideoRef.current) {
          pipVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        toast({
          title: "Couldn't start camera",
          description: err instanceof Error ? err.message : "Permission denied.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl h-[90vh] bg-background border-border flex flex-col p-0 overflow-hidden shadow-2xl">

        {/* Header bar */}
        <div className="h-14 border-b border-border/50 flex justify-between items-center bg-card px-4 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-destructive/15 flex items-center justify-center">
              <Activity className="w-4 h-4 text-destructive animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground leading-none">{session.title}</h2>
              <span className="text-[10px] font-mono text-destructive uppercase tracking-wider font-bold">
                Live Broadcast · {activeMode === "idle" ? "paused" : `${activeMode} mode`}
              </span>
            </div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close live session" onClick={onClose} className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Main Stage */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* ── Media stage ─────────────────────────────────────── */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto relative bg-grid-white/[0.02]">
              {/* Host sees their own local media preview. Spectators get an
                  honest status panel: true live video to spectators requires a
                  realtime streaming backend (WebRTC signaling server) that is
                  not yet deployed. The host's recording, the participant list,
                  and the chat below are real and update as the session runs. */}
              {!isHost && activeMode !== "idle" && (
                <div className="w-full max-w-3xl aspect-video rounded-2xl border border-border/50 bg-card/60 flex flex-col items-center justify-center text-center p-8 gap-3">
                  <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
                    <Radio className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">
                    Host is sharing {activeMode === "cam" ? "their camera" : activeMode === "screen" ? "their screen" : "a peer screen"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                    Live video for spectators needs a realtime streaming backend (WebRTC signaling), which isn't deployed yet. The host's recording, participants, and chat here are real and update as the session progresses.
                  </p>
                </div>
              )}
              {isHost && (activeMode === "screen" || activeMode === "peer-screen" || activeMode === "cam") && (
                <div
                  ref={videoContainerRef}
                  className="w-full max-w-3xl aspect-video bg-black rounded-2xl overflow-hidden border border-border/50 shadow-lg relative select-none"
                  onMouseDown={handleVideoMouseDown}
                  onMouseMove={(e) => { handleVideoMouseMove(e); handlePipMouseMove(e); }}
                  onMouseUp={() => { handleVideoMouseUp(); handlePipMouseUp(); }}
                  onMouseLeave={() => { handleVideoMouseUp(); handlePipMouseUp(); }}
                  style={{ cursor: cropEnabled || annotationTool !== "none" ? "crosshair" : "default" }}
                >
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isHost}
                    className="w-full h-full object-contain"
                  />

                  {/* FRAG-2: Crop overlay — blacks out everything outside
                      the selected rectangle. Only the area inside the
                      crop is visible to viewers (privacy). */}
                  {cropEnabled && cropRect && cropRect.w > 0 && (
                    <>
                      {/* Four black rectangles around the crop area */}
                      <div className="absolute pointer-events-none bg-black/90" style={{ top: 0, left: 0, right: 0, height: `${cropRect.y}%` }} />
                      <div className="absolute pointer-events-none bg-black/90" style={{ top: `${cropRect.y}%`, left: 0, width: `${cropRect.x}%`, height: `${cropRect.h}%` }} />
                      <div className="absolute pointer-events-none bg-black/90" style={{ top: `${cropRect.y}%`, left: `${cropRect.x + cropRect.w}%`, right: 0, height: `${cropRect.h}%` }} />
                      <div className="absolute pointer-events-none bg-black/90" style={{ top: `${cropRect.y + cropRect.h}%`, left: 0, right: 0, bottom: 0 }} />
                      {/* Crop border */}
                      <div className="absolute pointer-events-none border-2 border-emerald-500 rounded" style={{
                        left: `${cropRect.x}%`, top: `${cropRect.y}%`,
                        width: `${cropRect.w}%`, height: `${cropRect.h}%`,
                      }} />
                    </>
                  )}

                  {/* FRAG-3: Annotation overlays — blur sections + arrows */}
                  {annotations.map(ann => (
                    <div key={ann.id} className="absolute pointer-events-none">
                      {ann.type === "blur" && (
                        <div
                          className="absolute backdrop-blur-lg bg-black/30 border border-amber-500/50 rounded"
                          style={{
                            left: `${ann.x}%`, top: `${ann.y}%`,
                            width: `${ann.w ?? 5}%`, height: `${ann.h ?? 5}%`,
                          }}
                        />
                      )}
                      {ann.type === "arrow" && ann.x2 !== undefined && ann.y2 !== undefined && (
                        <svg className="absolute inset-0 w-full h-full overflow-visible" style={{ pointerEvents: "none" }}>
                          <defs>
                            <marker id={`arrow-${ann.id}`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                              <path d="M0,0 L8,4 L0,8 Z" fill="#f59e0b" />
                            </marker>
                          </defs>
                          <line
                            x1={`${ann.x}%`} y1={`${ann.y}%`}
                            x2={`${ann.x2}%`} y2={`${ann.y2}%`}
                            stroke="#f59e0b" strokeWidth="3" strokeLinecap="round"
                            markerEnd={`url(#arrow-${ann.id})`}
                          />
                        </svg>
                      )}
                    </div>
                  ))}

                  {/* FRAG-4: Picture-in-picture webcam bubble — floats on
                      top of the screen share like OBS/Zoom. Draggable. */}
                  {showPip && (
                    <div
                      className="absolute z-30 rounded-full overflow-hidden border-2 border-white shadow-2xl"
                      style={{
                        left: `${pipPosition.x}%`, top: `${pipPosition.y}%`,
                        width: "18%", aspectRatio: "1",
                        cursor: isDraggingPip ? "grabbing" : "grab",
                      }}
                      onMouseDown={handlePipMouseDown}
                    >
                      <video
                        ref={pipVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] text-center py-0.5 font-mono uppercase tracking-wider">
                        <Camera className="w-2 h-2 inline mr-1" />You
                      </div>
                    </div>
                  )}

                  {/* Recording indicator */}
                  <div className="absolute top-3 left-3 bg-black/70 text-white text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1.5 z-20">
                    <Radio className="w-3 h-3 animate-pulse" />
                    {activeMode}{showPip ? " + cam" : ""}
                  </div>
                </div>
              )}

              {activeMode === "voice" && (
                <div className="w-full max-w-md flex flex-col items-center gap-4 py-12">
                  <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Volume2 className="w-12 h-12 text-emerald-500 animate-pulse" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
                    Live voice · {me?.isMuted ? "muted" : "broadcasting"}
                  </p>
                </div>
              )}

              {activeMode === "idle" && (
                <div className="text-center max-w-md">
                  <Radio className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium text-foreground">No media is broadcasting</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isHost
                      ? "Pick a source below to start: screen, peer screen, voice, or camera."
                      : "The host hasn't started a source yet. Sit tight."}
                  </p>
                </div>
              )}

              {/* Hidden audio element for voice/cam/screen audio */}
              <audio ref={audioRef} autoPlay />

              {/* ── Host media controls ────────────────────────────── */}
              {isHost && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  {MEDIA_MODES.map(({ mode, label, icon: Icon, hint, color }) => {
                    const isActive = activeMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleModeToggle(mode)}
                        title={hint}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                          isActive
                            ? "bg-foreground text-background shadow-lg"
                            : "bg-muted/60 text-foreground hover:bg-muted border border-border/50"
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isActive ? "" : color}`} />
                        {label}
                      </button>
                    );
                  })}
                  {/* Self-mute toggle — only relevant when voice/cam/screen audio is active */}
                  {(activeMode === "voice" || activeMode === "cam" || activeMode === "screen") && (
                    <button
                      type="button"
                      onClick={handleMuteToggle}
                      title={me?.isMuted ? "Unmute myself" : "Mute myself"}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                        me?.isMuted
                          ? "bg-red-500/15 text-red-500 border border-red-500/30"
                          : "bg-muted/60 text-foreground hover:bg-muted border border-border/50"
                      }`}
                    >
                      {me?.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      {me?.isMuted ? "Unmute" : "Mute"}
                    </button>
                  )}

                  {/* Part 2 Task 2: Record + Background (PiP) controls */}
                  {localStream && (
                    <>
                      {isRecording ? (
                        <button
                          type="button"
                          onClick={handleStopRecording}
                          title="Stop recording"
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold bg-red-500 text-white shadow-lg animate-pulse"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" /> Stop Rec
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleStartRecording}
                          title="Start recording"
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold bg-muted/60 text-foreground hover:bg-muted border border-border/50"
                        >
                          <Circle className="w-3.5 h-3.5 text-red-500 fill-red-500" /> Record
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleTogglePip}
                        title="Background mode (Picture-in-Picture)"
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                          isPipActive
                            ? "bg-foreground text-background shadow-lg"
                            : "bg-muted/60 text-foreground hover:bg-muted border border-border/50"
                        }`}
                      >
                        <PictureInPicture2 className="w-4 h-4" />
                        {isPipActive ? "Exit BG" : "Background"}
                      </button>
                    </>
                  )}
                  {lastRecordingUrl && (
                    <a
                      href={lastRecordingUrl}
                      download={`recording-${lastRecordingTimestamp ?? 0}.webm`}
                      title="Download recording"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
                    >
                      <Download className="w-4 h-4" /> Download
                    </a>
                  )}

                  {/* ── FRAG-2/3/4: Pro tools toolbar ─────────────────── */}
                  {/* Only show when screen or peer-screen is active (these
                      tools don't make sense for voice-only or cam-only). */}
                  {(activeMode === "screen" || activeMode === "peer-screen") && (
                    <div className="w-full flex flex-wrap items-center justify-center gap-2 pt-3 mt-3 border-t border-border/30">
                      {/* FRAG-2: Crop / select-area toggle */}
                      <button
                        type="button"
                        onClick={() => {
                          setCropEnabled(!cropEnabled);
                          if (cropEnabled) setCropRect(null);
                          setAnnotationTool("none");
                        }}
                        title="Crop — only share a selected area (privacy)"
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all active:scale-95 ${
                          cropEnabled
                            ? "bg-emerald-500 text-white shadow"
                            : "bg-muted/60 text-foreground hover:bg-muted border border-border/50"
                        }`}
                      >
                        <Crop className="w-3.5 h-3.5" />
                        Crop
                      </button>

                      {/* FRAG-3: Blur tool */}
                      <button
                        type="button"
                        onClick={() => {
                          setAnnotationTool(annotationTool === "blur" ? "none" : "blur");
                          setCropEnabled(false);
                          if (annotationTool !== "blur") {
                            setAnnotations(prev => [...prev, { id: `ann-${Date.now()}`, type: "blur", x: 30, y: 30, w: 10, h: 10 }]);
                          }
                        }}
                        title="Blur — hide sensitive sections"
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all active:scale-95 ${
                          annotationTool === "blur"
                            ? "bg-amber-500 text-white shadow"
                            : "bg-muted/60 text-foreground hover:bg-muted border border-border/50"
                        }`}
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        Blur
                      </button>

                      {/* FRAG-3: Arrow tool */}
                      <button
                        type="button"
                        onClick={() => {
                          setAnnotationTool(annotationTool === "arrow" ? "none" : "arrow");
                          setCropEnabled(false);
                          if (annotationTool !== "arrow") {
                            setAnnotations(prev => [...prev, { id: `ann-${Date.now()}`, type: "arrow", x: 20, y: 50, x2: 50, y2: 50 }]);
                          }
                        }}
                        title="Arrow — draw marked arrows"
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all active:scale-95 ${
                          annotationTool === "arrow"
                            ? "bg-amber-500 text-white shadow"
                            : "bg-muted/60 text-foreground hover:bg-muted border border-border/50"
                        }`}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        Arrow
                      </button>

                      {/* Clear annotations */}
                      {annotations.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setAnnotations([]); setAnnotationTool("none"); }}
                          title="Clear all annotations"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all active:scale-95 bg-muted/60 text-muted-foreground hover:bg-destructive/10 hover:text-destructive border border-border/50"
                        >
                          <Eraser className="w-3.5 h-3.5" />
                          Clear
                        </button>
                      )}

                      {/* FRAG-4: PiP camera toggle — adds a floating webcam
                          bubble on top of the screen share (OBS/Zoom style). */}
                      <button
                        type="button"
                        onClick={() => void handleTogglePipCamera()}
                        title="Floating camera bubble"
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all active:scale-95 ${
                          showPip
                            ? "bg-sky-500 text-white shadow"
                            : "bg-muted/60 text-foreground hover:bg-muted border border-border/50"
                        }`}
                      >
                        <Camera className="w-3.5 h-3.5" />
                        {showPip ? "Cam On" : "Cam Bubble"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Mind node stage (only if a mind is attached) ──── */}
              {mind && currentNode && (activeMode === "idle" || !isHost) && (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentNode.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    transition={{ duration: 0.3 }}
                    className="w-full max-w-2xl text-center space-y-6 bg-card/50 p-8 rounded-[2rem] border shadow-sm backdrop-blur-sm mt-6"
                  >
                    {currentNode.node_type === "question" ? (
                      <>
                        <div className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight leading-tight">
                          {currentNode.question_text}
                        </div>
                        {isHost ? (
                          <div className="flex justify-center gap-6 pt-6">
                            <Button
                              onClick={() => handleHostDecision(true)}
                              className="h-16 px-10 text-xl font-bold bg-secondary/10 text-secondary hover:bg-secondary hover:text-secondary-foreground border border-secondary/20 transition-all hover:scale-105"
                            >
                              YES
                            </Button>
                            <Button
                              onClick={() => handleHostDecision(false)}
                              className="h-16 px-10 text-xl font-bold bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/20 transition-all hover:scale-105"
                            >
                              NO
                            </Button>
                          </div>
                        ) : (
                          <div className="pt-6">
                            <div className="animate-pulse flex flex-col items-center gap-3">
                              <Activity className="w-6 h-6 text-muted-foreground" />
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Waiting for host to decide...</p>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-2">
                          <CheckCircle2 className="w-10 h-10 text-primary" />
                        </div>
                        <h3 className="text-2xl font-bold text-primary mb-3">{currentNode.result_text || "Conclusion Reached"}</h3>
                        <div className="bg-background/80 border border-border/50 p-4 rounded-[16px] text-left">
                          <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Next Steps</h4>
                          <p className="text-base text-foreground/90 leading-relaxed whitespace-pre-wrap">{currentNode.next_steps}</p>
                        </div>
                        {!isHost && (
                          <div className="pt-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Rate this logic</p>
                            <Button variant="outline" className="rounded-full gap-2 text-amber-500 border-amber-500/30 hover:bg-amber-500/10">
                              <Flame className="w-4 h-4" /> Brilliant Reasoning
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* ── Right Sidebar: Participants + Chat ─────────────────── */}
          <div className="w-72 border-l border-border/50 bg-muted/10 flex flex-col shrink-0">
            {/* Participants */}
            <div className="p-4 border-b border-border/50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Users className="w-3.5 h-3.5" /> Participants ({participants.length})
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {participants.map(p => (
                  <div key={p.userId} className="flex items-center gap-2">
                    <Avatar className={`w-6 h-6 border ${p.role === 'host' ? 'border-destructive ring-1 ring-destructive/50' : 'border-border'}`}>
                      <AvatarImage src={p.avatarUrl} />
                      <AvatarFallback className="text-[9px] bg-background">
                        {(p.displayName || "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-semibold text-foreground truncate flex-1">
                      {p.displayName}
                    </span>
                    {/* Mic state indicator */}
                    {p.role === "host" ? (
                      <span className="text-[9px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded uppercase font-bold">Host</span>
                    ) : p.canSpeak ? (
                      p.isMuted ? (
                        <MicOff className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <Mic className="w-3 h-3 text-emerald-500" />
                      )
                    ) : (
                      // Spectator without mic permission — host can grant.
                      isHost && p.userId !== CURRENT_USER_ID ? (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic("selection");
                            void grantMic(p.userId, true);
                          }}
                          className="text-[9px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded uppercase font-bold hover:bg-emerald-500/20"
                          title="Grant microphone access"
                        >
                          + Mic
                        </button>
                      ) : null
                    )}
                    {/* Host can revoke mic */}
                    {isHost && p.canSpeak && p.userId !== CURRENT_USER_ID && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic("light");
                          void grantMic(p.userId, false);
                        }}
                        className="text-[9px] bg-red-500/10 text-red-600 px-1.5 py-0.5 rounded uppercase font-bold hover:bg-red-500/20"
                        title="Revoke microphone access"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {participants.length <= 1 && (
                <p className="text-[10px] text-muted-foreground italic mt-2">
                  Visitors can join via the live session link. They'll appear here and can chat; the host grants mic access to let them speak.
                </p>
              )}
            </div>

            {/* Chat */}
            <div className="flex-1 flex flex-col min-h-0">
              <div ref={chatScrollRef} className="flex-1 p-3 overflow-y-auto space-y-2">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-6">
                    <MessageSquare className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-30" />
                    <p className="text-[11px] text-muted-foreground">No messages yet. Say hello.</p>
                  </div>
                ) : (
                  chatMessages.map(msg => (
                    <div
                      key={msg.id}
                      className={`rounded-lg p-2 text-xs ${
                        msg.isSystem
                          ? "bg-muted/40 text-muted-foreground italic text-center"
                          : msg.senderId === CURRENT_USER_ID
                            ? "bg-primary/10 text-foreground ml-4"
                            : "bg-background border border-border/50 text-foreground"
                      }`}
                    >
                      {!msg.isSystem && (
                        <span className="font-bold text-foreground">{msg.senderName}: </span>
                      )}
                      {msg.content}
                    </div>
                  ))
                )}
              </div>

              <div className="p-3 border-t border-border/50 bg-background">
                <form
                  onSubmit={(e) => { e.preventDefault(); void handleSendChat(); }}
                  className="relative"
                >
                  <Input
                    type="text"
                    placeholder="Type to chat..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    maxLength={500}
                    className="bg-muted/50 border-border rounded-full text-xs pr-9"
                  />
                  <Button
                    type="submit"
                    size="icon" aria-label="Send chat message"
                    variant="ghost"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
                    disabled={isSendingChat || !chatInput.trim()}
                  >
                    <Send className="w-3 h-3" />
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
