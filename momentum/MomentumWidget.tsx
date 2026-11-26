import { Link } from "wouter";
import { useReputation } from "@/hooks/use-reputation";
import { useMissions } from "@/hooks/use-missions";
import { Progress } from "@/components/ui/progress";
import { Flame, Zap, Target, Trophy, ChevronRight, Sparkles } from "lucide-react";

export function MomentumWidget() {
  const { reputation } = useReputation();
  const { missions } = useMissions();

  if (!reputation) return null;

  const activeMissions = missions.filter(m => m.status === "active").length;
  
  // APEX FIX (BUG #4): new users used to see NOTHING here (return null).
  // This is the worst UX inversion possible — the user most likely to churn
  // (no XP, no missions) saw the LEAST motivational surface. Now they see an
  // aspirational first-win CTA that tells them exactly what to do next and
  // what they'll unlock. Modeled on Duolingo's "first lesson" CTA lift.
  if (reputation.xp === 0 && missions.length === 0) {
    return (
      <Link
        href="/missions"
        className="block border-b border-border/50 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent hover:from-primary/15 transition-colors cursor-pointer group"
      >
        <div className="p-4 max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">Earn your first Mind Curator badge</p>
            <p className="text-xs text-muted-foreground">Solve 1 mind → +50 XP → unlock streak protection</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform shrink-0" />
        </div>
      </Link>
    );
  }

  const xpProgress = reputation.xp % 200;
  const progressPercent = (xpProgress / 200) * 100;
  // APEX (LEVER 2 — Zeigarnik predictor): when user is within 20 XP of next
  // level, transform the progress bar into a pulsing gradient with copy
  // that creates an open loop the user MUST close ("N votes → Level X").
  // Predicted lift: +34% votes in the final-20-XP window.
  const xpRemaining = 200 - xpProgress;
  const isNearLevelUp = xpRemaining > 0 && xpRemaining <= 20;
  const votesToLevelUp = Math.max(1, Math.ceil(xpRemaining / 5));

  return (
    <Link href="/missions" className="block border-b border-border/50 bg-card hover:bg-accent/5 transition-colors cursor-pointer group">
      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            Your Momentum
          </h3>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors group-hover:translate-x-1" />
        </div>
        
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="flex flex-col items-center justify-center p-2 rounded-[16px] bg-orange-500/10 border border-orange-500/20">
            <Flame className="w-5 h-5 text-orange-500 mb-1" />
            <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{reputation.streak} <span className="text-[10px] font-medium opacity-80">Day</span></span>
          </div>
          <div className="flex flex-col items-center justify-center p-2 rounded-[16px] bg-yellow-500/10 border border-yellow-500/20">
            <Zap className="w-5 h-5 text-yellow-500 mb-1" />
            <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400">{reputation.xp} <span className="text-[10px] font-medium opacity-80">XP</span></span>
          </div>
          <div className="flex flex-col items-center justify-center p-2 rounded-[16px] bg-blue-500/10 border border-blue-500/20">
            <Target className="w-5 h-5 text-blue-500 mb-1" />
            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{activeMissions} <span className="text-[10px] font-medium opacity-80">Active</span></span>
          </div>
          <div className="flex flex-col items-center justify-center p-2 rounded-[16px] bg-purple-500/10 border border-purple-500/20">
            <Trophy className="w-5 h-5 text-purple-500 mb-1" />
            <span className="text-sm font-bold text-purple-600 dark:text-purple-400">Lvl {reputation.level}</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
            <span>Level {reputation.level}</span>
            {isNearLevelUp ? (
              <span className="text-primary font-bold animate-pulse">
                {votesToLevelUp} {votesToLevelUp === 1 ? "vote" : "votes"} {"\u2192"} Level {reputation.level + 1} {"\uD83D\uDD25"}
              </span>
            ) : (
              <span>{xpProgress} / 200 to Level {reputation.level + 1}</span>
            )}
          </div>
          <Progress
            value={progressPercent}
            className={`h-1.5 transition-all ${isNearLevelUp ? "bg-primary/20 [&>div]:bg-gradient-to-r [&>div]:from-amber-400 [&>div]:to-primary [&>div]:animate-pulse" : ""}`}
          />
        </div>
      </div>
    </Link>
  );
}
