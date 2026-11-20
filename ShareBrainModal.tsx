import { useEffect, useMemo, useRef, useState } from "react";
import { decodeShareHash, type SharePayload } from "@/lib/share-link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrainCircuit, X, CheckCircle2, GitFork, Link2, Loader2 } from "lucide-react";
import { Brain, Node } from "@/lib/types";
import { idb } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import { computeConfidence, summarizeBrain } from "@/lib/reasoning-view";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { ReasoningTree } from "@/components/ui/reasoning-tree";
import { ViewErrorBoundary } from "@/components/ui/view-error-boundary";
import { trackEvent } from "@/lib/analytics";
import { triggerHaptic } from "@/lib/device";

/**
 * ShareBrainModal — the receiver side of a shared brain link.
 *
 * PHASE 3 upgrades:
 *  - RICH PREVIEW: before importing, the receiver now sees the actual
 *    reasoning (the same tree used in the runtime), a confidence score, and a
 *    one-line summary of the logic — instead of a blind "Import?" prompt. This
 *    is the anti-Quora move: you can judge the reasoning before you take it.
 *  - ONE-CLICK FORK: "Import" always creates an independent copy whose own
 *    forked-from attribution is recorded, so experts can build on each other
 *    without ever editing the original.
 *  - DOUBLE-CLICK GUARD + pending state on the async import.
 */
export function ShareBrainModal() {
  const [decoded, setDecoded] = useState<SharePayload | null>(() => {
    const result = decodeShareHash(window.location.hash);
    return result.ok ? result.payload : null;
  });

  /**
   * BUG FIX #12 (shared links silently ignored): the hash was decoded exactly
   * once at mount. The app mounts at "/" with no hash, so a `#share=…` link
   * pasted into the SAME tab (or fired after hydration, or reached from an
   * in-app "share" button) never opened the modal — the receiver saw nothing.
   * Listening to hashchange/popstate makes the modal reactive to the URL,
   * which is the actual source of truth for a share link.
   */
  useEffect(() => {
    const sync = () => {
      const result = decodeShareHash(window.location.hash);
      setDecoded(result.ok ? result.payload : null);
    };
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  const [imported, setImported] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importingRef = useRef(false);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();

  const confidence = useMemo(
    () => (decoded ? computeConfidence(decoded.brain, decoded.nodes) : null),
    [decoded],
  );
  const summary = useMemo(
    () => (decoded ? summarizeBrain(decoded.brain, decoded.nodes) : null),
    [decoded],
  );

  const handleClose = () => {
    setDecoded(null);
    setImported(false);
    setShowPreview(false);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  };

  const handleImport = async () => {
    if (!decoded) return;
    if (importingRef.current) return;
    importingRef.current = true;
    setIsImporting(true);
    try {
      const newBrainId = crypto.randomUUID();
      const forkedFrom = decoded.brain.title;
      const newBrain: Brain = {
        ...decoded.brain,
        id: newBrainId,
        created_at: Date.now(),
        title: decoded.brain.title.endsWith(" (imported)")
          ? decoded.brain.title
          : decoded.brain.title + " (imported)",
        // FORK ATTRIBUTION: keep the lineage visible in the reader's library.
        contributors: [{ name: forkedFrom, role: "original brain" }, ...(decoded.brain.contributors ?? [])],
        source_refs: [
          { type: "brain", id: decoded.brain.id, label: `Forked from "${forkedFrom}"` },
          ...(decoded.brain.source_refs ?? []),
        ],
        // A fork is private until the new owner deliberately publishes it.
        repo_status: "private",
      };
      const newNodes: Node[] = decoded.nodes.map((n) => ({
        ...n,
        id: crypto.randomUUID(),
        brain_id: newBrainId,
      }));

      // Remap node references to use new IDs
      const oldToNew = new Map<string, string>();
      decoded.nodes.forEach((oldN, i) => oldToNew.set(oldN.id, newNodes[i].id));
      for (const n of newNodes) {
        if (n.if_true_node_id) n.if_true_node_id = oldToNew.get(n.if_true_node_id) ?? n.if_true_node_id;
        if (n.if_false_node_id) n.if_false_node_id = oldToNew.get(n.if_false_node_id) ?? n.if_false_node_id;
      }
      if (newBrain.root_node_id) {
        newBrain.root_node_id = oldToNew.get(newBrain.root_node_id) ?? newBrain.root_node_id;
      }

      // Local-first: IDB write is the source of truth for a fork; cloud sync
      // happens later through the normal brain-sync path.
      await idb.saveBrainWithNodes(newBrain, newNodes);

      triggerHaptic("success");
      void trackEvent("brain_forked", {
        sourceBrainId: decoded.brain.id,
        nodeCount: newNodes.length,
        confidence: confidence?.score ?? null,
      });

      setImported(true);
      toast({ title: "Brain forked!", description: `"${newBrain.title}" is now yours to edit and improve.` });
      setTimeout(handleClose, 1800);
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Could not import this brain.",
        variant: "destructive",
      });
    } finally {
      importingRef.current = false;
      setIsImporting(false);
    }
  };

  if (!decoded) return null;

  const tags = (decoded.brain.category || "").split(",").map((t) => t.trim()).filter(Boolean);
  const qCount = decoded.nodes.filter((n) => n.node_type === "question").length;
  const oCount = decoded.nodes.filter((n) => n.node_type === "outcome").length;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card border-border/60 sm:rounded-[16px]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <BrainCircuit className="w-5 h-5 text-primary" />
            <span className="text-xs font-mono text-primary uppercase tracking-wider">Shared Brain Received</span>
          </div>
          <DialogTitle className="text-xl font-bold">{decoded.brain.title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed mt-1">
            {decoded.brain.description || "No description provided."}
          </DialogDescription>
          {confidence && summary && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ConfidenceBadge confidence={confidence} />
              <span className="text-[11px] text-muted-foreground">{summary.headline}</span>
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag, i) => (
                <Badge key={i} variant="outline" className="bg-secondary/10 text-secondary border-secondary/20 font-mono text-[10px] uppercase">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-background border border-border/50 rounded-[16px] p-3 text-center">
              <div className="text-xl font-bold">{decoded.nodes.length}</div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase mt-0.5">Nodes</div>
            </div>
            <div className="bg-background border border-border/50 rounded-[16px] p-3 text-center">
              <div className="text-xl font-bold text-primary">{qCount}</div>
              <div className="text-[10px] font-mono text-primary uppercase mt-0.5">Questions</div>
            </div>
            <div className="bg-background border border-border/50 rounded-[16px] p-3 text-center">
              <div className="text-xl font-bold text-secondary">{oCount}</div>
              <div className="text-[10px] font-mono text-secondary uppercase mt-0.5">Outcomes</div>
            </div>
          </div>

          {/* RICH PREVIEW — judge the reasoning before you fork it. */}
          {showPreview ? (
            <ViewErrorBoundary label="shared brain preview" compact>
              <ReasoningTree brain={decoded.brain} nodes={decoded.nodes} className="max-h-72" />
            </ViewErrorBoundary>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => setShowPreview(true)}
              disabled={decoded.nodes.length === 0}
            >
              <Link2 className="h-3.5 w-3.5" /> Preview the reasoning ({decoded.nodes.length} nodes)
            </Button>
          )}

          {confidence && confidence.danglingBranches > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              This brain has {confidence.danglingBranches} unwired branch
              {confidence.danglingBranches === 1 ? "" : "es"} — you can fix them after forking.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={handleClose} className="gap-2">
            <X className="w-4 h-4" /> Dismiss
          </Button>
          <Button onClick={handleImport} disabled={imported || isImporting} className="gap-2 flex-1">
            {imported ? (
              <><CheckCircle2 className="w-4 h-4" /> Forked to your library!</>
            ) : isImporting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Forking…</>
            ) : (
              <><GitFork className="w-4 h-4" /> Fork &amp; improve</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
