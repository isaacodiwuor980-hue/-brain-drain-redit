import { useState, useEffect, useRef, useCallback } from "react";
import { Mind, Node, NodeAttachment } from "@/lib/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { idb } from "@/lib/db";
import { Bot, RotateCcw, AlertTriangle, CheckCircle2, X, FileCode2, FileText, Copy, Check, Share2, ArrowLeft, ArrowRight } from "lucide-react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";
import { triggerHaptic } from "@/lib/device";

interface MindChatRuntimeProps {
  mind: Mind | null;
  isOpen: boolean;
  onClose: () => void;
}

export function MindChatRuntime({ mind, isOpen, onClose }: MindChatRuntimeProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [path, setPath] = useState<{ node: Node; decision?: boolean }[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  // APEX-OMEGA FIX (R3): session-scoped resume for in-progress mind runs.
  // Previously, closing the dialog mid-run (X / Escape / backdrop tap)
  // discarded currentNodeId + path → reopening restarted from root.
  // That's a rage-quit moment: user accidentally taps X, loses 5 minutes
  // of decision-tree progress. Now we persist (mindId, currentNodeId,
  // path-node-ids) to sessionStorage on every state change, and restore
  // on dialog open. sessionStorage (not localStorage) so it clears when
  // the browser closes — cross-session resume is a separate IDB feature.
  const resumeKey = mind ? `mindRunResume:${mind.id}` : null;

  useEffect(() => {
    if (mind && isOpen) {
      idb.getAllByIndex<Node>("nodes", "mind_id", mind.id).then(loadedNodes => {
        setNodes(loadedNodes);
        // Try to resume an in-progress session for this mind.
        let restoredNodeId: string | null = mind.root_node_id;
        let restoredPath: { node: Node; decision?: boolean }[] = [];
        if (resumeKey) {
          try {
            const raw = sessionStorage.getItem(resumeKey);
            if (raw) {
              const saved = JSON.parse(raw) as {
                currentNodeId: string;
                pathNodeIds: { id: string; decision?: boolean }[];
              };
              // Only restore if the saved currentNodeId still exists in
              // the mind (the mind may have been edited since the save).
              const exists = loadedNodes.some(n => n.id === saved.currentNodeId);
              if (exists) {
                restoredNodeId = saved.currentNodeId;
                // Re-hydrate path nodes from IDs. Skip any IDs that no
                // longer exist (mind edited) — partial restore is better
                // than no restore.
                const nodeMap = new Map(loadedNodes.map(n => [n.id, n]));
                restoredPath = saved.pathNodeIds
                  .map(p => {
                    const node = nodeMap.get(p.id);
                    if (!node) return null;
                    const entry: { node: Node; decision?: boolean } = { node };
                    if (typeof p.decision === "boolean") entry.decision = p.decision;
                    return entry;
                  })
                  .filter((p): p is { node: Node; decision?: boolean } => p !== null);
              }
            }
          } catch {
            // Corrupted resume data — ignore and start fresh.
          }
        }
        setCurrentNodeId(restoredNodeId);
        setPath(restoredPath);
      });
    }
  }, [mind, isOpen, resumeKey]);

  // APEX-OMEGA R3: persist current state to sessionStorage on every change.
  // Throttled via rAF so rapid decisions don't hammer sessionStorage.
  const saveResumeRef = useRef<number | null>(null);
  useEffect(() => {
    if (!resumeKey || !isOpen) return undefined;
    if (saveResumeRef.current !== null) {
      cancelAnimationFrame(saveResumeRef.current);
    }
    saveResumeRef.current = requestAnimationFrame(() => {
      saveResumeRef.current = null;
      try {
        sessionStorage.setItem(
          resumeKey,
          JSON.stringify({
            currentNodeId,
            pathNodeIds: path.map(p => ({ id: p.node.id, decision: p.decision })),
          }),
        );
      } catch {
        // sessionStorage may be unavailable (private mode) — best-effort.
      }
    });
    return () => {
      if (saveResumeRef.current !== null) {
        cancelAnimationFrame(saveResumeRef.current);
      }
    };
  }, [resumeKey, isOpen, currentNodeId, path]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [path, currentNodeId]);

  const currentNode = nodes.find(n => n.id === currentNodeId);

  const handleDecision = (decision: boolean) => {
    if (!currentNode) return;

    setPath(prev => [...prev, { node: currentNode, decision }]);

    const nextNodeId = decision ? currentNode.if_true_node_id : currentNode.if_false_node_id;
    if (nextNodeId) {
      const nextNode = nodes.find(n => n.id === nextNodeId);
      if (nextNode?.node_type === "outcome") {
        triggerHaptic("success");
        // APEX-OMEGA R3: clear resume state on outcome — the run is complete.
        // Don't restore a finished session next time the user opens the mind.
        if (resumeKey) {
          try { sessionStorage.removeItem(resumeKey); } catch { /* ignore */ }
        }
      } else {
        triggerHaptic("selection");
      }
      setCurrentNodeId(nextNodeId);
    } else {
      triggerHaptic("warning");
      setCurrentNodeId(null);
    }
  };

  const handleRestart = () => {
    triggerHaptic("light");
    setCurrentNodeId(mind?.root_node_id || null);
    setPath([]);
    // APEX-OMEGA R3: explicit restart clears resume state too.
    if (resumeKey) {
      try { sessionStorage.removeItem(resumeKey); } catch { /* ignore */ }
    }
  };

  // Task 9: swipe gestures for the current question node.
  // Swipe right = Yes, swipe left = No. Buttons remain as a fallback.
  const SWIPE_THRESHOLD = 60; // px — minimum horizontal travel to register
  const handleSwipeEnd = useCallback((_e: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) < SWIPE_THRESHOLD) return;
    handleDecision(info.offset.x > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDecision already closes over currentNode (listed); adding it would re-create this callback on every render and re-trigger swipe handlers downstream.
  }, [currentNode]);

  // Task 9b: helper — does a node have an image attachment?
  // Used to decide text sizing (large when no image, normal when image present).
  const hasImage = (node?: Node | null): boolean => {
    if (!node?.attachments || node.attachments.length === 0) return false;
    return node.attachments.some((a: NodeAttachment) => a.type === "image");
  };

  if (!mind) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl h-[80vh] sm:h-[85vh] bg-background border-border flex flex-col p-0 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/50 flex flex-col gap-2 bg-card z-10 sticky top-0 backdrop-blur-xl">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border border-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary">
                  <Bot size={20} />
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-base font-semibold text-foreground leading-none">{mind.title}</h2>
                <span className="text-[11px] font-medium text-primary">Expert Mind Active</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" aria-label="Restart mind" onClick={handleRestart} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <RotateCcw className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Close mind chat" onClick={onClose} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {path.length > 0 && (
            <div className="flex gap-1 overflow-x-auto pb-1 mt-1 scrollbar-hide">
              {path.map((step, idx) => (
                <div key={idx} className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded bg-muted/50 text-foreground border border-border/50">
                  {step.node.question_text?.substring(0, 20)}... <span className={step.decision ? "text-primary" : "text-destructive"}>{step.decision ? "YES" : "NO"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth bg-muted/20">
          <AnimatePresence initial={false}>
            {/* History */}
            {path.map((step, idx) => (
              <div key={idx} className="space-y-6">
                {/* Expert Question Bubble */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 max-w-[85%]"
                >
                  <Avatar className="h-8 w-8 shrink-0 mt-1">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      <Bot size={16} />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-card border border-border/50 rounded-[16px] rounded-tl-sm px-4 py-3 shadow-sm text-sm text-foreground flex flex-col gap-2">
                    <div>{step.node.question_text}</div>
                    {step.node.attachments && step.node.attachments.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2">
                        {step.node.attachments.map((att, i) => <AttachmentPreview key={i} attachment={att} />)}
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* User Answer Bubble */}
                {step.decision !== undefined && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex justify-end w-full"
                  >
                    <div className="bg-primary text-primary-foreground rounded-[16px] rounded-tr-sm px-5 py-2.5 shadow-sm text-sm font-medium">
                      {step.decision ? "Yes" : "No"}
                    </div>
                  </motion.div>
                )}
              </div>
            ))}

            {/* Current Node */}
            {currentNode ? (
              <motion.div
                key={currentNode.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 max-w-[85%]"
              >
                <Avatar className="h-8 w-8 shrink-0 mt-1">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    <Bot size={16} />
                  </AvatarFallback>
                </Avatar>
                
                {currentNode.node_type === "question" ? (
                  // Task 9: swipeable question card. Swipe right = Yes, left = No.
                  // Text is large + centered when no image attachment; normal size when image present.
                  <motion.div
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.6}
                    onDragEnd={handleSwipeEnd}
                    whileDrag={{ scale: 1.02 }}
                    className={`bg-card border border-border/50 rounded-[16px] rounded-tl-sm shadow-sm text-foreground flex flex-col gap-3 cursor-grab active:cursor-grabbing select-none ${hasImage(currentNode) ? "px-4 py-3 text-base" : "px-6 py-8 text-xl font-semibold text-center items-center justify-center min-h-[140px]"}`}
                  >
                    {/* Swipe hint arrows — subtle, fade when dragging */}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium pointer-events-none">
                      <span className="flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> No</span>
                      <span>Swipe to answer</span>
                      <span className="flex items-center gap-1">Yes <ArrowRight className="w-3 h-3" /></span>
                    </div>
                    <div>{currentNode.question_text}</div>
                    {currentNode.attachments && currentNode.attachments.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2">
                        {currentNode.attachments.map((att, i) => <AttachmentPreview key={i} attachment={att} />)}
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <div className="bg-card border border-primary/20 rounded-[16px] rounded-tl-sm p-5 shadow-md w-full flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                      <span className="font-semibold text-primary">Diagnostic Complete</span>
                    </div>
                    <h3 className="text-lg font-bold text-foreground">{currentNode.result_text}</h3>
                    {currentNode.next_steps && (
                      <div className="bg-muted/50 rounded-[16px] p-3 text-sm text-foreground/80 whitespace-pre-wrap border border-border/50">
                        {currentNode.next_steps}
                      </div>
                    )}
                    {currentNode.attachments && currentNode.attachments.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2">
                        {currentNode.attachments.map((att, i) => <AttachmentPreview key={i} attachment={att} />)}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 max-w-[85%]"
              >
                <Avatar className="h-8 w-8 shrink-0 mt-1">
                  <AvatarFallback className="bg-destructive/10 text-destructive text-xs">
                    <AlertTriangle size={16} />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-destructive/5 border border-destructive/20 text-destructive rounded-[16px] rounded-tl-sm px-4 py-3 shadow-sm text-sm">
                  Engine Halted. Incomplete logic path.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input Area */}
        <div className="p-4 bg-card border-t border-border/50 relative z-10">
          {currentNode?.node_type === "question" ? (
            <div className="flex gap-3">
              <Button 
                onClick={() => handleDecision(true)} 
                className="flex-1 h-12 text-base font-semibold shadow-sm transition-transform active:scale-95"
              >
                Yes
              </Button>
              <Button 
                onClick={() => handleDecision(false)} 
                variant="secondary"
                className="flex-1 h-12 text-base font-semibold shadow-sm transition-transform active:scale-95"
              >
                No
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button 
                variant={isCopied ? "default" : "secondary"}
                className="flex-1 h-11 text-xs font-semibold rounded-full gap-2 transition-all cursor-pointer"
                onClick={async () => {
                  triggerHaptic("selection");
                  const shareText = `🧠 Mind Diagnostic Result: ${mind.title}\n✅ Result: ${currentNode?.result_text || "Complete"}\n📋 Next Steps: ${currentNode?.next_steps || "None"}\n\nRan with Mind Builder: ${window.location.origin}`;
                  try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      await navigator.clipboard.writeText(shareText);
                    }
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2500);
                    toast({
                      title: "Result Copied to Clipboard! 📋",
                      description: "Your diagnostic conclusion and next steps are copied.",
                    });
                    void trackEvent("puzzle_score_copied", { type: "diagnostic_chat", mindId: mind.id });
                  } catch (e) {
                    console.error(e);
                  }
                }}
              >
                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? "Copied!" : "Copy Result"}</span>
              </Button>

              <Button 
                variant="outline" 
                className="h-11 px-4 text-xs font-semibold rounded-full gap-2 cursor-pointer border-border/60"
                onClick={async () => {
                  triggerHaptic("selection");
                  const shareText = `🧠 Just resolved "${mind.title}" using Mind Builder!\nOutcome: ${currentNode?.result_text}`;
                  if (typeof navigator !== "undefined" && navigator.share) {
                    try {
                      await navigator.share({
                        title: mind.title,
                        text: shareText,
                        url: window.location.origin,
                      });
                      void trackEvent("puzzle_score_shared", { channel: "native_share", mindId: mind.id });
                      return;
                    } catch {}
                  }
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(window.location.origin)}`, "_blank");
                }}
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </Button>

              <Button onClick={handleRestart} variant="outline" className="h-11 px-4 text-xs font-semibold rounded-full border-border/60">
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AttachmentPreview({ attachment }: { attachment: NodeAttachment }) {
  if (attachment.type === "image") {
    return (
      <div className="border border-border/50 rounded overflow-hidden max-w-sm">
        <img src={attachment.data} alt={attachment.name} loading="lazy" decoding="async" className="w-full h-auto object-contain" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 p-2 border border-border/50 rounded bg-muted/20 text-xs">
      {attachment.type === "pdf" ? <FileText className="w-4 h-4 text-primary" /> : <FileCode2 className="w-4 h-4 text-primary" />}
      <span className="truncate font-medium">{attachment.name}</span>
    </div>
  );
}
