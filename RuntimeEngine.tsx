import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { Brain, Node } from "@/lib/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { loadBrainData } from "@/lib/load-brain-data";
import { RotateCcw, AlertTriangle, CheckCircle2, Activity, Copy, Check, Share2, Network, ListOrdered, PlayCircle } from "lucide-react";
import { ReasoningTree } from "@/components/ui/reasoning-tree";
import { ReasoningWalkthrough } from "@/components/ui/reasoning-walkthrough";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { computeConfidence, type ReasoningMode } from "@/lib/reasoning-view";
import { ViewErrorBoundary } from "@/components/ui/view-error-boundary";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";
import { triggerHaptic } from "@/lib/device";

interface RuntimeEngineProps {
  brain: Brain | null;
  isOpen: boolean;
  onClose: () => void;
}

export function RuntimeEngine({ brain, isOpen, onClose }: RuntimeEngineProps) {
  const [, setLocation] = useLocation();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loadState, setLoadState] = useState<{ id: string; error?: string } | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [path, setPath] = useState<{ node: Node; decision?: boolean }[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  /**
   * PHASE 3: three presentations of the SAME reasoning.
   *   focus       — one question at a time (the interactive runtime)
   *   tree        — the visual reasoning tree
   *   walkthrough — the whole logic as a readable, numbered document
   * Persisted so a reader who prefers the walkthrough keeps it between runs.
   */
  const [mode, setMode] = useState<ReasoningMode>(() => {
    try {
      const saved = localStorage.getItem("brain-drain-reasoning-mode");
      if (saved === "tree" || saved === "walkthrough" || saved === "focus") return saved;
    } catch {
      /* storage blocked — fall through to the default */
    }
    return "focus";
  });
  const confidence = useMemo(
    () => (brain ? computeConfidence(brain, nodes) : null),
    [brain, nodes],
  );
  const { toast } = useToast();


  const handleRestart = useCallback(() => {
    triggerHaptic("light");
    // BUG FIX: use the same fallback chain as the useEffect so restart
    // doesn't re-introduce the null-root bug. If root_node_id is null
    // (incomplete brain), fall back to the first question node, then
    // the first node of any type, then null only if the brain is empty.
    const fallbackStart =
      brain?.root_node_id ||
      nodes.find(n => n.node_type === "question")?.id ||
      nodes[0]?.id ||
      null;
    setCurrentNodeId(fallbackStart);
    setPath([]);
  }, [brain?.root_node_id, nodes]);

  useEffect(() => {
    if (!brain || !isOpen) return;
    let cancelled = false;
    loadBrainData(brain.id).then((data) => {
      if (cancelled) return;
      if (!data) throw new Error("Brain data is unavailable on this device.");
      setNodes(data.nodes);
      setCurrentNodeId(data.brain.root_node_id || data.nodes.find((n) => n.node_type === "question")?.id || data.nodes[0]?.id || null);
      setPath([]);
      setLoadState({ id: brain.id });
    }).catch((error: unknown) => {
      if (cancelled) return;
      setNodes([]);
      setCurrentNodeId(null);
      setPath([]);
      setLoadState({ id: brain.id, error: error instanceof Error ? error.message : "Could not load brain data." });
    });
    return () => { cancelled = true; };
  }, [brain, isOpen, loadAttempt]);

  const currentNode = nodes.find(n => n.id === currentNodeId);
  // Detect the "brain has no nodes at all" case so we can show a helpful
  // message instead of the generic halt. This guides the user to the editor
  // instead of leaving them stuck.
  const brainIsEmpty = nodes.length === 0;

  const handleDecision = useCallback((decision: boolean) => {
    if (!currentNode) return;

    setPath(prev => [...prev, { node: currentNode, decision }]);

    const nextNodeId = decision ? currentNode.if_true_node_id : currentNode.if_false_node_id;
    if (nextNodeId) {
      const nextNode = nodes.find(n => n.id === nextNodeId);
      // BUG FIX: if the branch points to a node that doesn't exist (deleted,
      // broken import, or a corrupted brain_id reference), don't jump to a
      // non-existent ID — that would make currentNode undefined and halt the
      // engine with no recovery. Instead, show a clear "broken branch" state.
      if (!nextNode) {
        triggerHaptic("warning");
        toast({
          title: "Broken branch",
          description: `The ${decision ? "YES" : "NO"} branch points to a node that no longer exists. Open the brain in the editor to fix it.`,
          variant: "destructive",
          duration: 5000,
        });
        return;
      }
      if (nextNode.node_type === "outcome") {
        triggerHaptic("success");
      } else {
        triggerHaptic("selection");
      }
      setCurrentNodeId(nextNodeId);
    } else {
      triggerHaptic("warning");
      // Reached an end unexpectedly — a question with no branch wired.
      // Don't null out currentNodeId (that would show the generic halt
      // state). Instead, keep the user on the current question and show
      // a clear toast so they know why nothing happened.
      toast({
        title: "No branch wired",
        description: `This question has no ${decision ? "YES" : "NO"} branch. Open the brain in the editor to add one.`,
        variant: "destructive",
        duration: 5000,
      });
    }
  }, [currentNode, nodes, toast]);

  const changeMode = useCallback((next: ReasoningMode) => {
    setMode(next);
    triggerHaptic("selection");
    try {
      localStorage.setItem("brain-drain-reasoning-mode", next);
    } catch {
      /* storage blocked — in-memory only */
    }
    void trackEvent("reasoning_view_changed", { mode: next, brainId: brain?.id ?? null });
  }, [brain?.id]);

  /**
   * PHASE 3 — instant keyboard navigation. In focus mode: Y/ArrowLeft = YES,
   * N/ArrowRight = NO, R = restart, 1/2/3 = switch view. Deliberately ignored
   * while the user is typing in a field so it can never hijack a text input.
   */
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "1") return changeMode("focus");
      if (key === "2") return changeMode("tree");
      if (key === "3") return changeMode("walkthrough");
      if (key === "r") return handleRestart();
      if (mode !== "focus") return;
      // Only answer when the current step is actually a question.
      if (currentNode?.node_type === "question") {
        if (key === "y" || e.key === "ArrowLeft") return handleDecision(true);
        if (key === "n" || e.key === "ArrowRight") return handleDecision(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // KEYBOARD FIX: this listener used to read three module-style refs that
    // were written DURING RENDER (a React correctness violation — refs must
    // not be read/written in the render phase). Re-subscribing with the real
    // handlers is one cheap addEventListener per open/step change.
  }, [isOpen, mode, currentNode?.node_type, handleDecision, handleRestart, changeMode]);


  if (!brain) return null;
  const dataReady = loadState?.id === brain.id && !loadState.error;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[85vh] bg-background border-border flex flex-col p-0 overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-border/50 flex justify-between items-center bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground leading-none truncate">{brain.title}</h2>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  {mode === "focus" ? "Interactive run" : mode === "tree" ? "Reasoning tree" : "Walkthrough"}
                </span>
                {confidence && <ConfidenceBadge confidence={confidence} />}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* PHASE 3: visual tree ⇄ clean walkthrough ⇄ interactive run.
                Three views of one brain, one tap apart — no more wall of
                text, and no forced "graph only" mode. Keys 1/2/3. */}
            <div
              role="tablist"
              aria-label="Reasoning view"
              className="flex items-center rounded-full border border-border/60 bg-muted/40 p-0.5"
            >
              {([
                { id: "focus", label: "Run", icon: PlayCircle, hint: "1" },
                { id: "tree", label: "Tree", icon: Network, hint: "2" },
                { id: "walkthrough", label: "Steps", icon: ListOrdered, hint: "3" },
              ] as const).map(({ id, label, icon: Icon, hint }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => changeMode(id)}
                  title={`${label} view (${hint})`}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    mode === id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={handleRestart} className="h-8" aria-label="Restart run">
              <RotateCcw className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Restart</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {/* Main Stage */}
          <div className={`flex-1 min-w-0 flex flex-col overflow-y-auto p-4 sm:p-8 relative ${
            mode === "focus" ? "items-center justify-center" : "items-stretch justify-start"
          }`}>
            {!dataReady && (
              <div role={loadState?.id === brain.id && loadState.error ? "alert" : "status"} className="text-sm text-muted-foreground">
                {loadState?.id === brain.id && loadState.error ? (
                  <>{loadState.error} <Button size="sm" variant="outline" onClick={() => setLoadAttempt((n) => n + 1)}>Retry</Button></>
                ) : "Loading brain data…"}
              </div>
            )}
            {dataReady && mode === "tree" && (
              <ViewErrorBoundary label="reasoning tree">
              <ReasoningTree
                brain={brain}
                nodes={nodes}
                activeNodeId={currentNodeId}
                onNodeClick={(node) => {
                  setCurrentNodeId(node.id);
                  changeMode("focus");
                }}
                className="w-full"
              />
              </ViewErrorBoundary>
            )}

            {dataReady && mode === "walkthrough" && (
              <ViewErrorBoundary label="walkthrough">
              <ReasoningWalkthrough
                brain={brain}
                nodes={nodes}
                onJumpToNode={(node) => {
                  setCurrentNodeId(node.id);
                  changeMode("focus");
                }}
                className="w-full max-w-3xl mx-auto"
              />
              </ViewErrorBoundary>
            )}

            {dataReady && mode === "focus" && (
            <AnimatePresence mode="wait">
              {currentNode ? (
                <motion.div
                  key={currentNode.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="w-full max-w-2xl text-center space-y-8"
                >
                  {currentNode.node_type === "question" ? (
                    <>
                      <div className="text-4xl font-semibold text-foreground tracking-tight leading-tight">
                        {currentNode.question_text}
                      </div>
                      <div className="flex justify-center gap-6 pt-8">
                        <Button 
                          onClick={() => handleDecision(true)} 
                          className="h-20 px-12 text-2xl font-bold bg-secondary/10 text-secondary hover:bg-secondary hover:text-secondary-foreground border border-secondary/20 transition-all hover:scale-105"
                        >
                          YES
                        </Button>
                        <Button 
                          onClick={() => handleDecision(false)} 
                          className="h-20 px-12 text-2xl font-bold bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/20 transition-all hover:scale-105"
                        >
                          NO
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full mb-6">
                        <CheckCircle2 className="w-12 h-12 text-primary" />
                      </div>
                      <h3 className="text-3xl font-bold text-primary mb-4">{currentNode.result_text}</h3>
                      <div className="bg-card border border-border/50 p-6 rounded-[16px] text-left shadow-lg">
                        <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">Next Steps</h4>
                        <p className="text-lg text-foreground/90 leading-relaxed whitespace-pre-wrap">{currentNode.next_steps}</p>
                      </div>
                      <div className="pt-6 flex flex-wrap items-center justify-center gap-3">
                        <Button 
                          variant={isCopied ? "default" : "secondary"}
                          className="h-11 px-5 text-sm font-semibold rounded-full gap-2 transition-all cursor-pointer"
                          onClick={async () => {
                            triggerHaptic("selection");
                            const shareText = `🧠 Brain Diagnostic Result: ${brain.title}\n✅ Result: ${currentNode.result_text}\n📋 Next Steps: ${currentNode.next_steps}\n\nRan with Brain Builder: ${window.location.origin}`;
                            try {
                              if (!navigator.clipboard?.writeText) {
                                throw new Error("Clipboard access is unavailable in this browser.");
                              }
                              await navigator.clipboard.writeText(shareText);
                              setIsCopied(true);
                              setTimeout(() => setIsCopied(false), 2500);
                              toast({
                                title: "Result Copied to Clipboard! 📋",
                                description: "Your diagnostic conclusion and next steps are copied.",
                              });
                              void trackEvent("puzzle_score_copied", { type: "diagnostic_engine", brainId: brain.id });
                            } catch (e) {
                              toast({
                                title: "Could not copy result",
                                description: e instanceof Error ? e.message : "Clipboard access failed.",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          <span>{isCopied ? "Copied to Clipboard!" : "Copy Result"}</span>
                        </Button>

                        <Button 
                          variant="outline" 
                          className="h-11 px-5 text-sm font-semibold rounded-full gap-2 cursor-pointer border-border/60"
                          onClick={async () => {
                            triggerHaptic("selection");
                            const shareText = `🧠 Just resolved "${brain.title}" using Brain Builder!\nOutcome: ${currentNode.result_text}`;
                            if (typeof navigator !== "undefined" && navigator.share) {
                              try {
                                await navigator.share({
                                  title: brain.title,
                                  text: shareText,
                                  url: window.location.origin,
                                });
                                void trackEvent("puzzle_score_shared", { channel: "native_share", brainId: brain.id });
                                return;
                              } catch {}
                            }
                            window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(window.location.origin)}`, "_blank");
                          }}
                        >
                          <Share2 className="w-4 h-4" />
                          <span>Share Result</span>
                        </Button>

                        <Button onClick={handleRestart} variant="outline" className="h-11 px-6 text-sm font-semibold rounded-full border-border/60 cursor-pointer">
                          <RotateCcw className="w-4 h-4 mr-2" /> Run Again
                        </Button>
                      </div>
                    </>
                  )}
                </motion.div>
              ) : (
                <div className="text-center bg-card p-6 rounded-xl border border-border/50 max-w-sm mx-auto shadow-sm">
                  {brainIsEmpty ? (
                    <>
                      <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                      <p className="text-sm font-medium text-foreground">This brain has no nodes yet</p>
                      <p className="text-xs text-muted-foreground mt-1 mb-4">
                        Open the brain in the editor and add at least one question node to run it.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full text-xs"
                        onClick={() => {
                          onClose();
                          // BUG FIX #15: this was a full `window.location.href`
                          // assignment — a hard page reload that re-downloaded
                          // the whole bundle, re-hydrated every IndexedDB store
                          // and dumped the user on a white screen for ~1-2s
                          // just to move one route. SPA navigation keeps all
                          // state (and the offline queue) intact.
                          try {
                            setLocation(`/library?brainId=${encodeURIComponent(brain.id)}`);
                          } catch {
                            toast({ title: "Open the Library", description: "Find this brain and tap Edit to add nodes." });
                          }
                        }}
                      >
                        Open in editor
                      </Button>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
                      <p className="text-sm font-medium text-foreground">Engine Halted</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Incomplete logic path detected. This branch has no next step — open the editor to wire the missing branch.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full text-xs mt-3"
                        onClick={handleRestart}
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restart from the top
                      </Button>
                    </>
                  )}
                </div>
              )}
            </AnimatePresence>
            )}
          </div>

          {/* Right Panel: Path history — only meaningful while running. */}
          <div
            className={`w-full md:w-64 shrink-0 border-t md:border-t-0 md:border-l border-border/50 bg-card/30 flex-col max-h-48 md:max-h-none ${
              mode === "focus" ? "flex" : "hidden md:hidden"
            }`}
          >
            <div className="p-3 border-b border-border/50">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Traversal History</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {path.map((step, idx) => (
                <div key={idx} className="relative">
                  <div className="text-xs font-medium text-foreground/80 mb-1">{step.node.question_text}</div>
                  <div className={`text-[10px] font-mono uppercase tracking-wider inline-flex px-1.5 py-0.5 rounded ${step.decision ? "bg-secondary/20 text-secondary" : "bg-destructive/20 text-destructive"}`}>
                    Selected: {step.decision ? "YES" : "NO"}
                  </div>
                  {idx < path.length - 1 && (
                    <div className="absolute -bottom-4 left-4 h-3 w-px bg-border/50" />
                  )}
                </div>
              ))}
              {path.length === 0 && (
                <div className="text-xs text-muted-foreground italic">Awaiting first decision...</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
