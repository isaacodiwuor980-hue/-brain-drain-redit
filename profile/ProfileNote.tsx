import { useState, useEffect } from "react";
import { useStories } from "@/hooks/use-stories";
import { useAuth } from "@/components/auth/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDatabase } from "@/hooks/use-database";
import { useToast } from "@/hooks/use-toast";

export function ProfileNote() {
  const { addStory, stories } = useStories();
  const { user } = useAuth();
  const { minds } = useDatabase();
  const { toast } = useToast();
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [selectedMindId, setSelectedMindId] = useState<string>("none");
  // Publish guard — prevents duplicate notes on rapid double-click.
  const [isPublishing, setIsPublishing] = useState(false);

  // A clock value read in an effect (not during render) so the expiry check
  // below stays pure. Refreshed on a 60s timer — expired notes drop off within
  // a minute of expiry, behaviorally equivalent to the previous per-render
  // Date.now() check for a human-readable "active note" badge.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Get active note for current user
  const activeNote = stories.find(s => s.userId === user?.id && s.type === "note" && s.expiresAt > now);

  const handlePublishNote = async () => {
    if (!noteContent || !user) return;
    if (isPublishing) return; // guard against rapid double-click
    setIsPublishing(true);
    try {
      await addStory({
        userId: user.id,
        authorName: user.displayName || user.username || "Anonymous",
        authorAvatar: user.avatarUrl,
        type: "note",
        content: noteContent,
        mindId: selectedMindId !== "none" ? selectedMindId : undefined
      });
      setIsAddingNote(false);
      setNoteContent("");
      setSelectedMindId("none");
    } catch (error) {
      toast({ title: "Couldn't share note", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <>
      <div 
        className="absolute -top-4 -right-4 bg-card border border-border shadow-md rounded-[16px] rounded-bl-sm px-3 py-1.5 cursor-pointer hover:scale-105 transition-transform z-20 flex items-center gap-1 group"
        onClick={() => setIsAddingNote(true)}
      >
        {activeNote ? (
          <span className="text-xs font-medium max-w-[100px] truncate">{activeNote.content}</span>
        ) : (
          <>
            <Plus className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
            <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">Note</span>
          </>
        )}
      </div>

      <Dialog open={isAddingNote} onOpenChange={setIsAddingNote}>
        <DialogContent className="max-w-sm rounded-[24px]">
          <DialogHeader>
            <DialogTitle>Share a Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>What's on your mind?</Label>
              <Input 
                value={noteContent} 
                onChange={e => setNoteContent(e.target.value)} 
                placeholder="Share a quick update..." 
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label>Attach a Mind (Optional)</Label>
              <Select value={selectedMindId} onValueChange={setSelectedMindId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a Mind" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {minds.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingNote(false)}>Cancel</Button>
            <Button onClick={handlePublishNote} disabled={isPublishing || !noteContent}>
              {isPublishing ? "Sharing…" : "Share Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
