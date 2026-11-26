import { useEffect, useState } from "react";
import { Mind, MindData } from "@/lib/types";
import { useDatabase } from "@/hooks/use-database";
import { useReputation } from "@/hooks/use-reputation";
import { useToast } from "@/hooks/use-toast";
import { MindCard } from "./MindCard";
import { MindDrawer } from "./MindDrawer";
import { WizardModal } from "./WizardModal";
import { ImportModal } from "./ImportModal";
import { RuntimeEngine } from "./RuntimeEngine";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, Network, Share, Download, PlayCircle } from "lucide-react";
import { idb } from "@/lib/db";
import { SampleMindLibrary } from "@/components/ui/SampleMindLibrary";

export function Dashboard() {
  const { minds, isLoading, saveMindData, deleteMind, exportData, getMindData, refresh } = useDatabase();
  const { addXPEvent } = useReputation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modals & Drawers state
  const [selectedMind, setSelectedMind] = useState<Mind | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isEngineOpen, setIsEngineOpen] = useState(false);
  const [isSamplesOpen, setIsSamplesOpen] = useState(false);
  
  // Forking state
  const [isForkOpen, setIsForkOpen] = useState(false);
  const [mindToFork, setMindToFork] = useState<Mind | null>(null);
  const [forkTitle, setForkTitle] = useState("");
  // Fork guard — prevents duplicate forks on rapid double-click.
  const [isForking, setIsForking] = useState(false);

  // Onboarding sets this flag when a new user taps "Try a sample mind".
  useEffect(() => {
    try {
      if (sessionStorage.getItem("MindSpool-open-sample") === "1") {
        sessionStorage.removeItem("MindSpool-open-sample");
        // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate mount-sync of external storage flag → open samples modal; refactoring to derived state would change behavior (one-time deep-link trigger, not a reactive derivation).
        setIsSamplesOpen(true);
      }
    } catch {
      // ignore private-mode storage errors
    }
    // CreateMenu deep link: /library?create=mind auto-opens the mind
    // wizard once (fired by the "+ Create" launcher in the app shell).
    // Two idempotent paths: window event (already on /library — wouter
    // does not re-run effects for search-only changes) + mount-time
    // query check (navigated from another page).
    const openWizardFromMenu = () => {
      setIsWizardOpen(true);
      if (window.location.search.includes("create=mind")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    };
    if (window.location.search.includes("create=mind")) {
      openWizardFromMenu();
    }
    window.addEventListener("bd:open-mind-wizard", openWizardFromMenu);
    return () => window.removeEventListener("bd:open-mind-wizard", openWizardFromMenu);
  }, []);

  const filteredMinds = minds.filter(b => 
    (b.title || "").toLowerCase().includes((searchQuery || "").toLowerCase()) || 
    (b.category || "").toLowerCase().includes((searchQuery || "").toLowerCase())
  );

  const handleCardClick = (mind: Mind) => {
    setSelectedMind(mind);
    setIsDrawerOpen(true);
  };

  const launchEngine = (mind: Mind) => {
    setSelectedMind(mind);
    setIsEngineOpen(true);
    setIsDrawerOpen(false); // Close drawer behind it
  };

  const handleImportSave = async (data: MindData[]) => {
    for (const d of data) {
      await saveMindData(d);
    }
  };

  const openForkDialog = (mind: Mind) => {
    setMindToFork(mind);
    setForkTitle(`Fork of ${mind.title}`);
    setIsForkOpen(true);
  };

  const handleSampleAdded = async (data: MindData) => {
    await saveMindData(data);
    await addXPEvent("mind_created", 10, "Tried a sample mind");
    toast({
      title: "Sample added",
      description: `"${data.mind.title}" is in your library. You can edit or run it anytime.`,
    });
  };

  const runMind = (mind: Mind) => launchEngine(mind);

  const executeFork = async () => {
    if (!mindToFork || !forkTitle) return;
    if (isForking) return; // guard against rapid double-click
    setIsForking(true);
    try {
      const data = await getMindData(mindToFork.id);
      if (!data) return;
      const { mind, nodes } = data;

      const newMindId = crypto.randomUUID();
      const newMind = {
        ...mind,
        id: newMindId,
        title: forkTitle,
        description: `${mind.description || ""}\n\n[Forked from: ${mind.title}]`,
        created_at: Date.now()
      };

      const idMap = new Map<string, string>();
      for (const n of nodes) {
        idMap.set(n.id, crypto.randomUUID());
      }

      const newNodes = nodes.map(n => ({
        ...n,
        id: idMap.get(n.id)!,
        mind_id: newMindId,
        if_true_node_id: n.if_true_node_id ? idMap.get(n.if_true_node_id) || n.if_true_node_id : n.if_true_node_id,
        if_false_node_id: n.if_false_node_id ? idMap.get(n.if_false_node_id) || n.if_false_node_id : n.if_false_node_id
      }));

      if (newMind.root_node_id && idMap.has(newMind.root_node_id)) {
        newMind.root_node_id = idMap.get(newMind.root_node_id)!;
      } else {
        // BUG FIX: the original root_node_id pointed to a node that doesn't
        // exist in this mind (deleted, or corrupted). Fall back to the first
        // question node, then the first node of any type, so the forked mind
        // is still runnable.
        newMind.root_node_id =
          newNodes.find(n => n.node_type === "question")?.id ?? newNodes[0]?.id ?? null;
      }

      await saveMindData({ mind: newMind, nodes: newNodes });
      await addXPEvent("mind_created", 30, "Forked a mind");

      toast({ title: "Mind forked", description: "Mind forked and saved to your library." });
      setIsForkOpen(false);
      setMindToFork(null);
    } catch (error) {
      toast({
        title: "Fork failed",
        description: error instanceof Error ? error.message : "Could not complete the fork.",
        variant: "destructive",
      });
    } finally {
      setIsForking(false);
    }
  };

  return (
    <div className="flex flex-col bg-background h-full w-full">
      <div className="p-4 border-b border-border/50 bg-card/50 flex justify-between items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search minds..." 
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void exportData().catch((error) => toast({ title: "Export failed", description: error instanceof Error ? error.message : "Could not export data.", variant: "destructive" }))} title="Export" aria-label="Export minds">
            <Share className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIsImportOpen(true)} title="Import" aria-label="Import minds">
            <Download className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsSamplesOpen(true)} className="gap-2">
            <PlayCircle className="w-4 h-4" /> Samples
          </Button>
          <Button size="sm" onClick={() => setIsWizardOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Mind
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {filteredMinds.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-border/50 rounded-[16px] bg-card/30">
                <Network className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                {searchQuery ? (
                  <>
                    <h3 className="text-lg font-medium mb-1">No minds found</h3>
                    <p className="text-muted-foreground">Adjust your search or create a new expert system.</p>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-medium mb-1">Start with a sample</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                      Try a ready-made decision mind to see how it works, then fork and edit it into your own.
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <Button onClick={() => setIsSamplesOpen(true)} className="gap-2">
                        <PlayCircle className="w-4 h-4" /> Try a sample
                      </Button>
                      <Button variant="outline" onClick={() => setIsWizardOpen(true)} className="gap-2">
                        <Plus className="w-4 h-4" /> Build your own
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              // Replaced framer-motion stagger-in with CSS animation. Each
              // card gets an incremental `animation-delay` so the stagger
              // effect is preserved. CSS animations run off the main thread
              // (compositor-only) so they don't jank the UI when many cards
              // mount at once. The `content-visibility: auto` + intrinsic
              // size hint remain so off-screen cards skip rendering.
              <div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                {filteredMinds.map((mind, i) => (
                  <div
                    key={mind.id}
                    style={{
                      contentVisibility: 'auto',
                      containIntrinsicSize: '200px',
                      animation: 'mind-card-in 240ms cubic-bezier(0.2, 0.9, 0.3, 1) both',
                      animationDelay: `${Math.min(i, 12) * 40}ms`,
                    }}
                  >
                    <MindCard
                      mind={mind}
                      onClick={() => handleCardClick(mind)}
                      onFork={openForkDialog}
                      onUpdated={refresh}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <MindDrawer 
        mind={selectedMind}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onLaunch={launchEngine}
        onDelete={deleteMind}
        onUpdated={refresh}
        onFork={(b) => { setIsDrawerOpen(false); openForkDialog(b); }}
        onExport={(b) => {
          // Simple single export
          idb.getAllByIndex("nodes", "mind_id", b.id).then(nodes => {
            const exportObj = { minds: [b], nodes };
            const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(b.title || "mind").replace(/\s+/g, '-').toLowerCase()}-export.json`;
            a.click();
            URL.revokeObjectURL(url);
          }).catch(() => {
            toast({ title: "Export failed", description: "Could not read mind data.", variant: "destructive" });
          });
        }}
      />

      <WizardModal 
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSave={saveMindData}
      />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImportSave}
      />

      <SampleMindLibrary
        open={isSamplesOpen}
        onOpenChange={setIsSamplesOpen}
        onSampleAdded={handleSampleAdded}
        onRunMind={runMind}
      />

      <RuntimeEngine
        mind={selectedMind}
        isOpen={isEngineOpen}
        onClose={() => setIsEngineOpen(false)}
      />

      <Dialog open={isForkOpen} onOpenChange={setIsForkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fork Mind</DialogTitle>
            <DialogDescription>
              Create a copy of this mind in your library to modify.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">New Title</label>
              <Input value={forkTitle} onChange={e => setForkTitle(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsForkOpen(false)}>Cancel</Button>
            <Button onClick={executeFork} disabled={isForking || !forkTitle}>
              {isForking ? "Forking…" : "Fork Mind"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
