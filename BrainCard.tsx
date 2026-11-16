import { memo } from "react";
import { Brain } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/device";
import { GitFork, Star } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { idb } from "@/lib/db";

export const BrainCard = memo(function BrainCard({ brain, onClick, onFork, onUpdated }: { brain: Brain; onClick: () => void; onFork?: (brain: Brain) => void; onUpdated?: () => void }) {
  // Use brain.tags if available, fall back to splitting category for backward compat.
  const tags = brain.tags ?? (brain.category || "").split(",").map(t => t.trim()).filter(Boolean);
  const { toast } = useToast();

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic("light");
    try {
      const updatedBrain = { ...brain, isFavorite: !brain.isFavorite };
      await idb.put("brains", updatedBrain);
      toast({
        title: updatedBrain.isFavorite ? "Brain favorited" : "Brain unfavorited",
        description: updatedBrain.isFavorite ? "Updates will be pushed to your messages." : "Removed from favorites."
      });
      if (onUpdated) onUpdated();
    } catch (error) {
      toast({
        title: "Couldn't update favorite",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const typeLabel = brain.brain_type
    ? { knowledge: "Knowledge", method: "Method", project: "Project", decision: "Decision" }[brain.brain_type]
    : null;

  return (
    <div
      className="h-full transition-transform duration-200 ease-out will-change-transform hover:-translate-y-1 hover:scale-[1.01] active:scale-[0.98]"
    >
      <Card
        className="h-full bg-card hover:border-primary/50 transition-colors border-border shadow-sm flex flex-col cursor-pointer relative group"
        onClick={onClick}
      >
        <CardHeader className="pb-3 flex-none">
          {/* Tags + type + visibility badges */}
          <div className="flex flex-wrap gap-1.5 mb-3 pr-8">
            {typeLabel && (
              <Badge variant="secondary" className="bg-violet-500/10 text-violet-600 dark:text-violet-400 font-mono text-[10px] tracking-wider uppercase">
                {typeLabel}
              </Badge>
            )}
            {tags.map((tag, i) => (
              <Badge key={i} variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 font-mono text-[10px] tracking-wider uppercase">
                {tag}
              </Badge>
            ))}
            {brain.repo_status === "public_repo" && (
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 text-[10px] font-bold uppercase">
                Published
              </Badge>
            )}
            {(!brain.repo_status || brain.repo_status === "private") && (
              <Badge variant="secondary" className="bg-muted/40 text-muted-foreground text-[10px] font-bold uppercase">
                Private
              </Badge>
            )}
          </div>
          <CardTitle className="text-xl font-semibold leading-tight text-foreground pr-8">{brain.title}</CardTitle>

          <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <Button
              variant="secondary"
              size="icon"
              aria-label={brain.isFavorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={brain.isFavorite}
              className={`h-8 w-8 rounded-full shadow-sm bg-background border transition-all duration-100 active:scale-[0.85] touch-manipulation ${brain.isFavorite ? "text-yellow-500 border-yellow-500/50" : "text-muted-foreground border-border/50 hover:text-yellow-500 hover:border-yellow-500/30"}`}
              onClick={handleToggleFavorite}
            >
              <Star className={`w-4 h-4 ${brain.isFavorite ? "fill-current" : ""}`} aria-hidden />
            </Button>
            {onFork && (
              <Button
                variant="secondary"
                size="icon"
                aria-label={`Fork ${brain.title}`}
                className="h-8 w-8 rounded-full shadow-sm bg-background border transition-all duration-100 active:scale-[0.85] touch-manipulation border-border/50 text-muted-foreground hover:text-primary hover:border-primary/30"
                onClick={(e) => {
                  e.stopPropagation();
                  onFork(brain);
                }}
              >
                <GitFork className="w-4 h-4" aria-hidden />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col justify-between">
          {/* Show summary if available, fall back to description */}
          <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
            {brain.summary || brain.description || "No description"}
          </p>
          <div className="text-[11px] text-muted-foreground/60 font-mono mt-auto flex justify-between">
            <span>Created: {brain.created_at ? format(new Date(brain.created_at), "yyyy-MM-dd") : "—"}</span>
            {brain.related_brain_ids && brain.related_brain_ids.length > 0 && (
              <span>{brain.related_brain_ids.length} linked</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
