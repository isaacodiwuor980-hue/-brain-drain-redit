import { useMemo, useState } from "react";
import { PlayCircle, RotateCcw, Sparkles, ArrowRight, CheckCircle2, Github, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SAMPLE_BRAINS } from "@/lib/sample-brains";
import type { Node } from "@/lib/types";
import { triggerHaptic } from "@/lib/device";
import { cn } from "@/lib/utils";

/**
 * QuickDecision — "instant value" onboarding.
 *
 * PHASE 3 / FRICTIONLESS ONBOARDING: a first-time visitor must be able to RUN
 * a real decision brain inside ~5 seconds, without a login wall, without the
 * library, and without waiting for IndexedDB/network. This renders a complete,
 * curated brain from the bundled sample set, in place, and only asks for a
 * sign-in when the user wants to SAVE what they just did.
 *
 * Everything here is synchronous local state over static data — no queries,
 * no auth, no storage on the critical path.
 */
const FEATURED = SAMPLE_BRAINS.slice(0, 3);

export function QuickDecision({
  onSaveBrain,
  onCreateOwn,
  onExploreSamples,
  className,
}: {
  /** Only called when the user asks to keep it — the natural sign-in moment. */
  onSaveBrain?: (index: number) => void | Promise<void>;
  onCreateOwn?: () => void;
  onExploreSamples?: () => void;
  className?: string;
}) {
  const [templateIndex, setTemplateIndex] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<boolean[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const sample = FEATURED[templateIndex] ?? FEATURED[0];
  const nodes = sample.nodes;
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const startId = sample.brain.root_node_id ?? nodes.find((n) => n.node_type === "question")?.id ?? null;
  const activeId = currentId ?? startId;
  const current: Node | undefined = activeId ? byId.get(activeId) : undefined;

  const reset = (nextTemplate = templateIndex) => {
    triggerHaptic("light");
    setTemplateIndex(nextTemplate);
    setCurrentId(FEATURED[nextTemplate]?.brain.root_node_id ?? null);
    setDecisions([]);
    setSaved(false);
  };

  const answer = (yes: boolean) => {
    if (!current) return;
    triggerHaptic(yes ? "selection" : "selection");
    const nextId = yes ? current.if_true_node_id : current.if_false_node_id;
    setDecisions((prev) => [...prev, yes]);
    if (nextId) setCurrentId(nextId);
  };

  const handleSave = async () => {
    if (!onSaveBrain || saving) return;
    setSaving(true);
    try {
      await onSaveBrain(templateIndex);
      setSaved(true);
    } catch {
      // The parent reports the error; leave the save action available to retry.
    } finally {
      setSaving(false);
    }
  };

  const isOutcome = current?.node_type === "outcome";
  const progress = decisions.length;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[20px] border border-border/60 bg-gradient-to-br from-card/80 via-card/50 to-background p-4 sm:p-5",
        className,
      )}
      aria-label="Try a decision brain instantly"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-bold leading-none text-foreground">Try a brain now</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">No sign-in. No setup. Answer two questions.</p>
          </div>
        </div>
        <div className="flex items-center gap-1" role="tablist" aria-label="Sample brains">
          {FEATURED.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === templateIndex}
              onClick={() => reset(i)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                i === templateIndex
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {s.emoji} <span className="hidden sm:inline">{s.category.split(",")[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {current && !isOutcome && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <span>Step {progress + 1}</span>
            <span className="flex items-center gap-1" aria-hidden>
              {decisions.map((d, i) => (
                <span
                  key={i}
                  className={cn("h-1.5 w-1.5 rounded-full", d ? "bg-emerald-500" : "bg-rose-500")}
                />
              ))}
            </span>
          </div>
          <p className="text-lg font-semibold leading-snug text-foreground sm:text-xl">{current.question_text}</p>
          <div className="flex gap-2">
            <Button
              onClick={() => answer(true)}
              className="flex-1 gap-2 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500 hover:text-white dark:text-emerald-400"
              variant="outline"
            >
              YES <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              onClick={() => answer(false)}
              className="flex-1 gap-2 bg-rose-500/15 text-rose-600 hover:bg-rose-500 hover:text-white dark:text-rose-400"
              variant="outline"
            >
              NO <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {current && isOutcome && (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
            <div>
              <p className="text-base font-semibold leading-snug text-foreground">{current.result_text}</p>
              {current.next_steps && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{current.next_steps}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={saved || saving || !onSaveBrain} className="gap-2">
              {saved ? (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> Saved to your library
                </>
              ) : saving ? (
                "Saving…"
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" aria-hidden /> Keep this brain
                </>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => reset()} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Run again
            </Button>
            {onCreateOwn && (
              <Button size="sm" variant="ghost" onClick={onCreateOwn} className="gap-1.5">
                <Briefcase className="h-3.5 w-3.5" aria-hidden /> Build my own
              </Button>
            )}
            {onExploreSamples && (
              <Button size="sm" variant="ghost" onClick={onExploreSamples} className="gap-1.5">
                <Github className="h-3.5 w-3.5" aria-hidden /> More samples
              </Button>
            )}
          </div>
        </div>
      )}

      {!current && (
        <p className="text-sm text-muted-foreground">This sample brain has no questions yet.</p>
      )}
    </section>
  );
}
