import { useState } from "react";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dashboard } from "@/components/Dashboard";
import { PathwaysTab } from "@/components/library/PathwaysTab";
import { SavedTopicsTab } from "@/components/library/SavedTopicsTab";
import { ShareModal } from "@/components/library/ShareModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Brain } from "@/lib/types";
import { Database, Network, Clock, Files, Library, Map as MapIcon, Hash, Lock, Globe } from "lucide-react";
import { useDatabase } from "@/hooks/use-database";
import { BrainCard } from "@/components/BrainCard";
import { PublicBrainLibrary } from "./PublicBrainLibrary";

/** A5: Local brains — private workspace. repo_status is "private" or undefined. */
function LocalBrainsTab({ onView }: { onView: (brain: Brain) => void }) {
  const { brains } = useDatabase();
  const localBrains = brains.filter((b) => !b.repo_status || b.repo_status === "private");
  if (localBrains.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed border-border/50 rounded-[16px] bg-card/30">
        <Lock className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
        <h3 className="text-lg font-medium">No local brains yet</h3>
        <p className="text-muted-foreground">Your private brain workspace. Create a brain to get started.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Your private workspace — these brains are not shared.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {localBrains.map((b) => <BrainCard key={b.id} brain={b} onClick={() => onView(b)} />)}
      </div>
    </div>
  );
}

/** A5: Published brains — shared knowledge assets. repo_status === "public_repo". */
function PublishedBrainsTab({ onView }: { onView: (brain: Brain) => void }) {
  const { brains } = useDatabase();
  const published = brains.filter((b) => b.repo_status === "public_repo");
  if (published.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed border-border/50 rounded-[16px] bg-card/30">
        <Globe className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
        <h3 className="text-lg font-medium">No published brains yet</h3>
        <p className="text-muted-foreground">When you publish a brain, it appears here as a shared knowledge asset.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Published brains are shared knowledge assets — only deliberately selected content is here.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {published.map((b) => <BrainCard key={b.id} brain={b} onClick={() => onView(b)} />)}
      </div>
    </div>
  );
}

/** Shared empty state so the four data tabs stay visually consistent. */
function TabEmpty({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Lock;
  title: string;
  body: string;
}) {
  return (
    <div className="p-12 text-center border border-dashed border-border/50 rounded-[16px] bg-card/30">
      <Icon className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}

/**
 * BUG FIX (dead tabs): "Brain Modules", "Shared Brains", "Imported" and
 * "Activity Timeline" were hard-coded "will appear here" placeholders — four
 * of nine library tabs were guaranteed dead ends, so the library looked
 * broken. Each now renders REAL IndexedDB data:
 *  - Modules: non-decision brain types (knowledge / method / project).
 *  - Shared: brains carrying contributor or source references (i.e. lineage).
 *  - Imported: forks/imports (title suffix or forked-from source_ref).
 *  - Timeline: every brain in reverse chronological order.
 */
function ModulesTab({ onView }: { onView: (brain: Brain) => void }) {
  const { brains } = useDatabase();
  const modules = brains.filter((b) => b.brain_type && b.brain_type !== "decision");
  if (modules.length === 0) {
    return (
      <TabEmpty
        icon={Library}
        title="No brain modules yet"
        body="Brains typed as knowledge, method or project appear here as reusable modules."
      />
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Reusable modules — knowledge, methods and projects you can attach to other brains.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.map((b) => <BrainCard key={b.id} brain={b} onClick={() => onView(b)} />)}
      </div>
    </div>
  );
}

function SharedTab({ onView }: { onView: (brain: Brain) => void }) {
  const { brains } = useDatabase();
  const shared = brains.filter(
    (b) => (b.contributors?.length ?? 0) > 0 || (b.source_refs?.length ?? 0) > 0,
  );
  if (shared.length === 0) {
    return (
      <TabEmpty
        icon={Network}
        title="No shared lineage yet"
        body="Brains you fork, cite or co-author carry provenance here — every reasoning tree keeps its ancestry."
      />
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Brains with provenance — forks, citations and contributors.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {shared.map((b) => <BrainCard key={b.id} brain={b} onClick={() => onView(b)} />)}
      </div>
    </div>
  );
}

function ImportedTab({ onView }: { onView: (brain: Brain) => void }) {
  const { brains } = useDatabase();
  const imported = brains.filter(
    (b) =>
      /\s\(imported\)$/i.test(b.title || "") ||
      (b.source_refs ?? []).some((r) => r.type === "brain"),
  );
  if (imported.length === 0) {
    return (
      <TabEmpty
        icon={Files}
        title="Nothing imported yet"
        body="Open a shared brain link or fork one from the library — your copies land here."
      />
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Copies you forked or imported. The originals are untouched.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {imported.map((b) => <BrainCard key={b.id} brain={b} onClick={() => onView(b)} />)}
      </div>
    </div>
  );
}

function TimelineTab({ onView }: { onView: (brain: Brain) => void }) {
  const { brains } = useDatabase();
  const ordered = [...brains].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  if (ordered.length === 0) {
    return <TabEmpty icon={Clock} title="No activity yet" body="Create or import a brain and its history starts here." />;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Chronological history of your brain library.</p>
      <ol className="relative border-l border-border/60 pl-5 space-y-4">
        {ordered.map((b) => (
          <li key={b.id} className="relative">
            <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary/70 ring-4 ring-background" aria-hidden />
            <button
              type="button"
              onClick={() => onView(b)}
              className="w-full text-left rounded-[12px] border border-border/40 bg-card/40 p-3 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">{b.title || "Untitled brain"}</span>
                {b.repo_status === "public_repo" && <Globe className="h-3.5 w-3.5 text-primary" aria-hidden />}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden />
                {b.created_at ? format(b.created_at, "MMM d, yyyy") : "Undated"}
                {b.category && <span className="truncate">· {b.category}</span>}
              </div>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LibraryContent() {
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedBrain, setSelectedBrain] = useState<Brain | null>(null);
  // B9: detail-dialog state — brain cards were dead clicks (onClick no-op)
  // and ShareModal was unreachable (selectedBrain locked to null, setter
  // never called). Cards now open a real detail view; published brains
  // surface the existing ShareModal from there.
  const [detailBrain, setDetailBrain] = useState<Brain | null>(null);

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-hidden bg-background">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Brains</h1>
          <p className="text-muted-foreground">Your expert systems, knowledge modules, and decision guides.</p>
        </div>

        <Tabs defaultValue="my-brain" className="w-full flex-1 flex flex-col">
          <TabsList aria-label="Library sections" className="w-full justify-start overflow-x-auto bg-muted/50 p-1 mb-6">
            <TabsTrigger value="my-brain" className="flex items-center gap-2 data-[state=active]:bg-background">
              <Database className="w-4 h-4" /> My Brain
            </TabsTrigger>
            {/* A5: Local vs Published separation */}
            <TabsTrigger value="local" className="flex items-center gap-2 data-[state=active]:bg-background">
              <Database className="w-4 h-4" /> Local (Private)
            </TabsTrigger>
            <TabsTrigger value="published" className="flex items-center gap-2 data-[state=active]:bg-background">
              <Network className="w-4 h-4" /> Published
            </TabsTrigger>
            <TabsTrigger value="modules" className="flex items-center gap-2 data-[state=active]:bg-background">
              <Library className="w-4 h-4" /> Brain Modules
            </TabsTrigger>
            <TabsTrigger value="topics" className="flex items-center gap-2 data-[state=active]:bg-background">
              <Hash className="w-4 h-4" /> Saved Topics
            </TabsTrigger>
            <TabsTrigger value="shared" className="flex items-center gap-2 data-[state=active]:bg-background">
              <Network className="w-4 h-4" /> Shared Brains
            </TabsTrigger>
            <TabsTrigger value="imported" className="flex items-center gap-2 data-[state=active]:bg-background">
              <Files className="w-4 h-4" /> Imported
            </TabsTrigger>
            <TabsTrigger value="pathways" className="flex items-center gap-2 data-[state=active]:bg-background">
              <MapIcon className="w-4 h-4" /> Pathways
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center gap-2 data-[state=active]:bg-background">
              <Clock className="w-4 h-4" /> Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-brain" className="flex-1 mt-0 border-0 p-0 m-0 outline-none">
            <div className="relative rounded-[16px] border border-border/50 overflow-hidden h-[80vh] flex flex-col">
              <Dashboard />
            </div>
          </TabsContent>

          {/* A5: Local Brains — private workspace (repo_status === "private" or undefined) */}
          <TabsContent value="local" className="flex-1 mt-0">
            <LocalBrainsTab onView={setDetailBrain} />
          </TabsContent>

          {/* A5: Published Brains — shared knowledge assets (repo_status === "public_repo") */}
          <TabsContent value="published" className="flex-1 mt-0">
            <PublishedBrainsTab onView={setDetailBrain} />
          </TabsContent>

          <TabsContent value="modules" className="flex-1">
            <ModulesTab onView={setDetailBrain} />
          </TabsContent>

          <TabsContent value="topics" className="flex-1">
            <SavedTopicsTab />
          </TabsContent>

          <TabsContent value="shared" className="flex-1">
            <SharedTab onView={setDetailBrain} />
          </TabsContent>

          <TabsContent value="imported" className="flex-1">
            <ImportedTab onView={setDetailBrain} />
          </TabsContent>

          <TabsContent value="pathways" className="flex-1">
            <PathwaysTab />
          </TabsContent>

          <TabsContent value="timeline" className="flex-1">
            <TimelineTab onView={setDetailBrain} />
          </TabsContent>
        </Tabs>
      </div>

      {/* B9: brain detail dialog — turns the formerly dead card clicks into
          a real read-only view. Published brains surface ShareModal here. */}
      <Dialog open={detailBrain !== null} onOpenChange={(open) => !open && setDetailBrain(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border/50">
          <DialogHeader>
            <DialogTitle>{detailBrain?.title}</DialogTitle>
            <DialogDescription>
              {detailBrain?.repo_status === "public_repo"
                ? "Published decision brain — shared with the network."
                : "Private decision brain — only you can see this."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium text-foreground capitalize">{detailBrain?.brain_type ?? "decision"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tags</span>
              <span className="font-medium text-foreground">{detailBrain?.tags?.length ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Visibility</span>
              <span className="font-medium text-foreground">
                {detailBrain?.repo_status === "public_repo" ? "Published" : "Private"}
              </span>
            </div>
          </div>
          {detailBrain?.repo_status === "public_repo" && (
            <Button
              className="w-full"
              onClick={() => {
                if (!detailBrain) return;
                setSelectedBrain(detailBrain);
                setShareModalOpen(true);
                setDetailBrain(null);
              }}
            >
              <Network className="w-4 h-4 mr-2" /> Share with the network
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        brain={selectedBrain}
      />
    </div>
  );
}

/** Local brain records have neither account-scoped ownership nor current
 * server-verified visibility. This is a UI containment, not access control. */
function libraryVisibilityVerified(): boolean { return false; }

export function LibraryPage() {
  if (libraryVisibilityVerified()) return <LibraryContent />;
  return <PublicBrainLibrary />;
}
