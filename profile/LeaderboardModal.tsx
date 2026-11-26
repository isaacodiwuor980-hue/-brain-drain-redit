import { useState } from "react";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import { LeaderboardTimeframe, LeaderboardMetric } from "@/lib/extension-types";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import { Trophy, Sparkles } from "lucide-react";
import { triggerHaptic } from "@/lib/device";
import { useAuth } from "@/components/auth/AuthContext";
import { userIdOr } from "@/lib/user-data";

export function LeaderboardModal() {
  const [timeframe, setTimeframe] = useState<LeaderboardTimeframe>("weekly");
  const [metric] = useState<LeaderboardMetric>("reasoning_xp");
  // Phase 2: real user ID for isMe check.
  const { user } = useAuth();
  const currentUserId = userIdOr(user);
  const { entries, isLoading } = useLeaderboard(timeframe, metric);

  return (
    <Card id="leaderboard-extension-card" className="p-5 rounded-2xl border-border/60 bg-card space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
            <Trophy className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Cognitive Leaderboard</h3>
            <p className="text-xs text-muted-foreground">Top reasoning minds and mind architects</p>
          </div>
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/40">
          {(["daily", "weekly", "all_time"] as LeaderboardTimeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setTimeframe(tf);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                timeframe === tf
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tf.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2 pt-1">
        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading scores...</div>
        ) : (
          entries.map((entry) => {
            const isMe = entry.userId === currentUserId;
            return (
              <div
                key={entry.userId}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  isMe
                    ? "bg-primary/10 border-primary/40"
                    : "bg-muted/15 border-border/40 hover:bg-muted/25"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 text-center font-bold text-xs sm:text-sm text-muted-foreground">
                    {entry.rank === 1 && "🥇"}
                    {entry.rank === 2 && "🥈"}
                    {entry.rank === 3 && "🥉"}
                    {entry.rank > 3 && `#${entry.rank}`}
                  </div>

                  <Avatar className="w-8 h-8 ring-1 ring-border/50">
                    <AvatarImage src={entry.avatarUrl} />
                    <AvatarFallback className="text-xs font-semibold bg-muted text-foreground">
                      {(entry.displayName || "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs sm:text-sm font-bold text-foreground leading-tight">
                        {entry.displayName}
                      </span>
                      {entry.badge && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 rounded-full border-border/60 text-muted-foreground">
                          {entry.badge}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">@{entry.username}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-foreground tabular-nums">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>{entry.score.toLocaleString()} XP</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
