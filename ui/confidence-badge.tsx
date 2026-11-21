import { BadgeCheck, AlertTriangle, PencilRuler, CircleSlash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BrainConfidence } from "@/lib/reasoning-view";

/**
 * Tree structure indicator, not a factual verification signal.
 *
 * Reddit and Quora give a reader no signal about whether a thread actually
 * concludes anything. This badge surfaces the computed confidence from
 * lib/reasoning-view.ts and explains the score in its tooltip — the same
 * numbers the creator sees in the editor, so there is no hidden scoring.
 */
const STYLES: Record<
  BrainConfidence["label"],
  { icon: typeof BadgeCheck; className: string }
> = {
  "Well connected": { icon: BadgeCheck, className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  "Mostly connected": { icon: BadgeCheck, className: "bg-primary/10 text-primary border-primary/30" },
  Draft: { icon: PencilRuler, className: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  Incomplete: { icon: CircleSlash2, className: "bg-destructive/10 text-destructive border-destructive/30" },
};

export function ConfidenceBadge({
  confidence,
  showScore = true,
  className,
}: {
  confidence: BrainConfidence;
  showScore?: boolean;
  className?: string;
}) {
  const { icon: Icon, className: tone } = STYLES[confidence.label] ?? STYLES.Draft;
  const detail = [
    `${confidence.questions} question${confidence.questions === 1 ? "" : "s"}`,
    `${confidence.outcomes} outcome${confidence.outcomes === 1 ? "" : "s"}`,
    `depth ${confidence.maxDepth}`,
    confidence.danglingBranches > 0
      ? `${confidence.danglingBranches} unwired branch${confidence.danglingBranches === 1 ? "" : "es"}`
      : "all branches wired",
    confidence.orphans > 0 ? `${confidence.orphans} unreachable node${confidence.orphans === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        tone,
        className,
      )}
      title={`Structure ${confidence.score}/100 — ${detail}. Does not verify accuracy or sources.`}
      aria-label={`Structure ${confidence.score} out of 100: ${confidence.label}. ${detail}. Does not verify accuracy or sources.`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>Structure: {confidence.label}</span>
      {showScore && <span className="font-mono opacity-80">{confidence.score}/100</span>}
      {confidence.danglingBranches > 0 && (
        <AlertTriangle className="h-3 w-3 opacity-80" aria-hidden />
      )}
    </span>
  );
}
