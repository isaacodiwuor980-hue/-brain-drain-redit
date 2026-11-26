import { useMemo } from "react";
import { ArrowRight, Dot, AlertTriangle } from "lucide-react";
import type { Brain, Node } from "@/lib/types";
import { buildWalkthrough } from "@/lib/reasoning-view";
import { cn } from "@/lib/utils";

/**
 * ReasoningWalkthrough — the whole decision tree as a scannable,
 * step-by-step document.
 *
 * This is the direct answer to Reddit/Quora's "wall of text": the same
 * reasoning is readable top-to-bottom, every step is numbered and indented by
 * depth, and each branch states where it leads. Clicking a step jumps back to
 * the interactive runtime at that node.
 */
export function ReasoningWalkthrough({
  brain,
  nodes,
  onJumpToNode,
  className,
}: {
  brain: Pick<Brain, "root_node_id">;
  nodes: Node[];
  onJumpToNode?: (node: Node) => void;
  className?: string;
}) {
  const steps = useMemo(() => buildWalkthrough(brain, nodes), [brain, nodes]);

  if (steps.length === 0) {
    return (
      <div className={cn("rounded-[16px] border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground", className)}>
        This brain has no reachable steps yet.
      </div>
    );
  }

  return (
    <ol className={cn("space-y-3", className)} aria-label="Step-by-step reasoning walkthrough">
      {steps.map((step, i) => {
        const isOutcome = step.node.node_type === "outcome";
        return (
          <li
            key={step.node.id}
            className="rounded-[16px] border border-border/50 bg-card/40 p-4"
            style={{ marginLeft: Math.min(step.depth, 4) * 16 }}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  isOutcome ? "bg-emerald-500/15 text-emerald-500" : "bg-primary/15 text-primary",
                )}
                aria-hidden
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {isOutcome ? "Outcome" : "Question"}
                  {step.incomplete && (
                    <span className="ml-2 inline-flex items-center gap-1 text-amber-500">
                      <AlertTriangle className="h-3 w-3" /> unwired branch
                    </span>
                  )}
                </div>
                <p className={cn("text-sm font-medium leading-relaxed text-foreground", isOutcome && "text-emerald-600 dark:text-emerald-400")}>
                  {isOutcome ? step.node.result_text : step.node.question_text}
                </p>
                {isOutcome && step.node.next_steps && (
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {step.node.next_steps}
                  </p>
                )}

                {step.branches.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {step.branches.map(({ decision, target }) => (
                      <li key={`${step.node.id}-${decision}`} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span
                          className={cn(
                            "rounded px-1 font-mono text-[10px] font-bold",
                            decision ? "bg-emerald-500/15 text-emerald-500" : "bg-rose-500/15 text-rose-500",
                          )}
                        >
                          {decision ? "YES" : "NO"}
                        </span>
                        <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 opacity-50" aria-hidden />
                        <span className="min-w-0 break-words">
                          {target.node_type === "outcome" ? target.result_text : target.question_text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {onJumpToNode && !isOutcome && (
                  <button
                    type="button"
                    onClick={() => onJumpToNode(step.node)}
                    className="mt-2 inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Dot className="h-3 w-3" aria-hidden /> Run from this step
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
