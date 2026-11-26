import { useState, useEffect } from "react";
import { Mind, Node } from "@/lib/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { idb } from "@/lib/db";
import { RotateCcw, AlertTriangle, CheckCircle2, Activity, Copy, Check, Share2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";
import { triggerHaptic } from "@/lib/device";

interface RuntimeEngineProps {
  mind: Mind | null;
  isOpen: boolean;
  onClose: () => void;
}

export function RuntimeEngine({ mind, isOpen, onClose }: RuntimeEngineProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [path, setPath] = useState<{ node: Node; decision?: boolean }[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (mind && isOpen) {
      // Guard: if the IDB read fails (e.g. the mind_id index isn't ready
      // on a fresh DB upgrade, or the browser is in private mode and IDB
      // is unavailable), don't crash the engine — show the empty state
      // instead so the user gets a helpful message.
      idb.getAllByIndex<Node>("nodes", "mind_id", mind.id).then(loadedNodes => {
        setNodes(loadedNodes);
        // Bug fix: previously this set currentNodeId to mind.root_node_id,
        // which can be null for a newly-created or incomplete mind. That
        // made currentNode undefined → the engine showed "Engine Halted /
        // Incomplete logic path detected" and the user could never run the
        // mind. Now we fall back to: (1) the declared root, (2) the first
        // question node, (3) the first node of any type, (4) null only if
        // the mind has zero nodes.
        const fallbackStart =
          mind.root_node_id ||
          loadedNodes.find(n => n.node_type === "question")?.id ||
          loadedNodes[0]?.id ||
          null;
        setCurrentNodeId(fallbackStart);
        setPath([]);
      }).catch((err) => {
        console.error("RuntimeEngine: failed to load nodes", err);
        setNodes([]);
        setCurrentNodeId(null);
        setPath([]);
      });
    }
  }, [mind, isOpen]);

  const currentNode = nodes.find(n => n.id === currentNodeId);
  // Detect the "mind has no nodes at all" case so we can show a helpful
  // message instead of the generic halt. This guides the user to the editor
  // instead of leaving them stuck.
  const mindIsEmpty = nodes.length === 0;

  const handleDecision = (decision: boolean) => {
    if (!currentNode) return;

    setPath(prev => [...prev, { node: currentNode, decision }]);

    const nextNodeId = decision ? currentNode.if_true_node_id : currentNode.if_false_node_id;
    if (nextNodeId) {
      const nextNode = nodes.find(n => n.id === nextNodeId);
      // BUG FIX: if the branch points to a node that doesn't exist (deleted,
      // broken import, or a corrupted mind_id reference), don't jump to a
      // non-existent ID — that would make currentNode undefined and halt the
      // engine with no recovery. Instead, show a clear "broken branch" state.
      if (!nextNode) {
        triggerHaptic("warning");
        toast({
          title: "Broken branch",
          description: `The ${decision ? "YES" : "NO"} branch points to a node that no longer exists. Open the mind in the editor to fix it.`,
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
        description: `This question has no ${decision ? "YES" : "NO"} branch. Open the mind in the editor to add one.`,
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const handleRestart = () => {
    triggerHaptic("light");
    // BUG FIX: use the same fallback chain as the useEffect so restart
    // doesn't re-introduce the null-root bug. If root_node_id is null
    // (incomplete mind), fall back to the first question node, then
    // the first node of any type, then null only if the mind is empty.
    const fallbackStart =
      mind?.root_node_id ||
      nodes.find(n => n.node_type === "question")?.id ||
      nodes[0]?.id ||
      null;
    setCurrentNodeId(fallbackStart);
    setPath([]);
  };

  if (!mind) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[85vh] bg-background border-border flex flex-col p-0 overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-border/50 flex justify-between items-center bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground leading-none">{mind.title}</h2>
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Edit & Repair Running</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRestart} className="h-8">
            <RotateCcw className="w-4 h-4 mr-2" /> Restart
          </Button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Main Stage */}
          <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto relative">
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
                            const shareText = `🧠 Mind Diagnostic Result: ${mind.title}\n✅ Result: ${currentNode.result_text}\n📋 Next Steps: ${currentNode.next_steps}\n\nRan with Mind Builder: ${window.location.origin}`;
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
                              void trackEvent("puzzle_score_copied", { type: "diagnostic_engine", mindId: mind.id });
                            } catch (e) {
                              console.error(e);
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
                            const shareText = `🧠 Just resolved "${mind.title}" using Mind Builder!\nOutcome: ${currentNode.result_text}`;
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
                  {mindIsEmpty ? (
                    <>
                      <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                      <p className="text-sm font-medium text-foreground">This mind has no nodes yet</p>
                      <p className="text-xs text-muted-foreground mt-1 mb-4">
                        Open the mind in the editor and add at least one question node to run it.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full text-xs"
                        onClick={() => {
                          onClose();
                          // Route to the library with this mind pre-selected
                          // so the user lands in the editor.
                          try {
                            window.location.href = `${window.location.origin}/library?mindId=${encodeURIComponent(mind.id)}`;
                          } catch {
                            toast({ title: "Open the Library", description: "Find this mind and tap Edit to add nodes." });
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
          </div>

          {/* Right Panel: Path history */}
          <div className="w-64 border-l border-border/50 bg-card/30 flex flex-col">
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
