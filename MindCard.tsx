import { memo } from "react";
import { Mind } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/device";
import { GitFork, Star } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { idb } from "@/lib/db";

export const MindCard = memo(function MindCard({ mind, onClick, onFork, onUpdated }: { mind: Mind; onClick: () => void; onFork?: (mind: Mind) => void; onUpdated?: () => void }) {
  // Use mind.tags if available, fall back to splitting category for backward compat.
  const tags = mind.tags ?? (mind.category || "").split(",").map(t => t.trim()).filter(Boolean);
  const { toast } = useToast();

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic("light");
    try {
      const updatedMind = { ...mind, isFavorite: !mind.isFavorite };
      await idb.put("minds", updatedMind);
      toast({
        title: updatedMind.isFavorite ? "Mind favorited" : "Mind unfavorited",
        description: updatedMind.isFavorite ? "Updates will be pushed to your messages." : "Removed from favorites."
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

  const typeLabel = mind.mind_type
    ? { knowledge: "Knowledge", method: "Method", project: "Project", decision: "Decision" }[mind.mind_type]
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
            {mind.repo_status === "public_repo" && (
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 text-[10px] font-bold uppercase">
                Published
              </Badge>
            )}
            {(!mind.repo_status || mind.repo_status === "private") && (
              <Badge variant="secondary" className="bg-muted/40 text-muted-foreground text-[10px] font-bold uppercase">
                Private
              </Badge>
            )}
          </div>
          <CardTitle className="text-xl font-semibold leading-tight text-foreground pr-8">{mind.title}</CardTitle>

          <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <Button
              variant="secondary"
              size="icon"
              aria-label={mind.isFavorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={mind.isFavorite}
              className={`h-8 w-8 rounded-full shadow-sm bg-background border transition-all duration-100 active:scale-[0.85] touch-manipulation ${mind.isFavorite ? "text-yellow-500 border-yellow-500/50" : "text-muted-foreground border-border/50 hover:text-yellow-500 hover:border-yellow-500/30"}`}
              onClick={handleToggleFavorite}
            >
              <Star className={`w-4 h-4 ${mind.isFavorite ? "fill-current" : ""}`} aria-hidden />
            </Button>
            {onFork && (
              <Button
                variant="secondary"
                size="icon"
                aria-label={`Fork ${mind.title}`}
                className="h-8 w-8 rounded-full shadow-sm bg-background border transition-all duration-100 active:scale-[0.85] touch-manipulation border-border/50 text-muted-foreground hover:text-primary hover:border-primary/30"
                onClick={(e) => {
                  e.stopPropagation();
                  onFork(mind);
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
            {mind.summary || mind.description || "No description"}
          </p>
          <div className="text-[11px] text-muted-foreground/60 font-mono mt-auto flex justify-between">
            <span>Created: {mind.created_at ? format(new Date(mind.created_at), "yyyy-MM-dd") : "—"}</span>
            {mind.related_mind_ids && mind.related_mind_ids.length > 0 && (
              <span>{mind.related_mind_ids.length} linked</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
