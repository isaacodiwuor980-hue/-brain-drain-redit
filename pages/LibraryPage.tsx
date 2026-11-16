import { useState } from "react";
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

export function LibraryPage() {
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
            <div className="p-12 text-center border border-dashed border-border/50 rounded-[16px] bg-card/30">
              <Library className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-medium">Brain Modules</h3>
              <p className="text-muted-foreground">Brains tagged as reusable modules will appear here.</p>
            </div>
          </TabsContent>

          <TabsContent value="topics" className="flex-1">
            <SavedTopicsTab />
          </TabsContent>

          <TabsContent value="shared" className="flex-1">
            <div className="p-12 text-center border border-dashed border-border/50 rounded-[16px] bg-card/30">
              <Network className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-medium">Shared Brains</h3>
              <p className="text-muted-foreground">Expert systems you've shared with the network.</p>
            </div>
          </TabsContent>

          <TabsContent value="imported" className="flex-1">
            <div className="p-12 text-center border border-dashed border-border/50 rounded-[16px] bg-card/30">
              <Files className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-medium">Imported Brains</h3>
              <p className="text-muted-foreground">Brains you've digested from other users.</p>
            </div>
          </TabsContent>

          <TabsContent value="pathways" className="flex-1">
            <PathwaysTab />
          </TabsContent>

          <TabsContent value="timeline" className="flex-1">
            <div className="p-12 text-center border border-dashed border-border/50 rounded-[16px] bg-card/30">
              <Clock className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-medium">Activity Timeline</h3>
              <p className="text-muted-foreground">Chronological history of your brain evolution.</p>
            </div>
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
