/**
 * SkillExtractModal.tsx — Skills + Habits publishing flow
 * (mind → scrape → edit → preview → publish to public).
 *
 * The full flow:
 *   1. User opens a mind that's been helpful
 *   2. "Extract as Skill" / "Extract as Habit" buttons are available in
 *      the mind's Overview tab (added to MindDrawer)
 *   3. On click, the mind's info is SCRAPED (outcome nodes → SkillSteps
 *      for skills; routine/anchor pattern for habits)
 *   4. User reviews + EDITS the scraped info in this modal (steps are
 *      reorderable, editable, deletable; metadata is editable)
 *   5. Preview shows exactly what other users will see
 *   6. User publishes → the skill/habit goes live to the public (synced
 *      to Supabase so other users can find it while building their minds)
 */

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSkills } from "@/hooks/use-skills";
import { useHabits } from "@/hooks/use-habits";
import { useAuth } from "@/components/auth/AuthContext";
import { userIdOr, displayNameOr } from "@/lib/user-data";
import type { Mind, Node, SkillStep, SkillEntry, Habit } from "@/lib/types";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Plus,
  Eye,
  Rocket,
  AlertCircle,
} from "lucide-react";

export type ExtractMode = "skill" | "habit";

interface SkillExtractModalProps {
  mind: Mind;
  nodes: Node[];
  mode: ExtractMode;
  isOpen: boolean;
  onClose: () => void;
}

// ── Step 1: SCRAPE — extract skill steps from mind nodes ─────────────────

function scrapeSkillFromMind(mind: Mind, nodes: Node[]): {
  steps: SkillStep[];
  title: string;
  domain: string;
} {
  const steps: SkillStep[] = nodes
    .filter((n) => n.node_type === "outcome" && (n.result_text || n.next_steps))
    .map((n, idx) => ({
      order: idx + 1,
      action: (n.result_text || n.next_steps || "").trim(),
      tool: undefined,
      why: n.question_text || mind.title,
      errorIfSkipped: undefined,
      yesOutcome: undefined,
      noOutcome: undefined,
      keywords: n.question_text
        ? n.question_text.split(/\s+/).filter((w) => w.length > 4).slice(0, 5)
        : [],
    }));

  return {
    steps,
    title: mind.title,
    domain: mind.category || "general",
  };
}

// ── Step 1b: SCRAPE habit — extract a habit pattern from mind nodes ──────

function scrapeHabitFromMind(mind: Mind, nodes: Node[]): {
  newRoutine: string;
  anchorHabit: string;
  timing: "before" | "after";
  reward: string;
  topic: string;
} {
  // Find the first outcome node with a result — that becomes the new routine.
  const firstOutcome = nodes.find((n) => n.node_type === "outcome" && n.result_text);
  // Find the first question node — its text hints at the anchor habit.
  const firstQuestion = nodes.find((n) => n.node_type === "question" && n.question_text);

  // Derive the anchor from the question text (strip trailing ? and common prefixes).
  const anchor = firstQuestion?.question_text
    ?.replace(/\?+$/, "")
    .replace(/^(should i|do i|can i|is it|will i)\s+/i, "")
    .trim() || "morning coffee";

  return {
    newRoutine: firstOutcome?.result_text?.trim() || `Practice: ${mind.title}`,
    anchorHabit: anchor,
    timing: "after",
    reward: "Check off the streak + feel the progress",
    topic: mind.category || "general",
  };
}

// ── Main component ────────────────────────────────────────────────────────

export function SkillExtractModal({ mind, nodes, mode, isOpen, onClose }: SkillExtractModalProps) {
  const { user } = useAuth();
  const skills = useSkills();
  const habits = useHabits();

  // Wizard state: "review" (edit scraped data) → "preview" → "done"
  const [wizardStep, setWizardStep] = useState<"review" | "preview" | "done">("review");

  // ── Skill state (mode === "skill") ──
  const scrapedSkill = useMemo(() => scrapeSkillFromMind(mind, nodes), [mind, nodes]);
  const [skillTitle, setSkillTitle] = useState(scrapedSkill.title);
  const [skillDomain, setSkillDomain] = useState(scrapedSkill.domain);
  const [authorName, setAuthorName] = useState(displayNameOr(user));
  const [authorYears, setAuthorYears] = useState<string>("");
  const [steps, setSteps] = useState<SkillStep[]>(scrapedSkill.steps);

  // ── Habit state (mode === "habit") ──
  const scrapedHabit = useMemo(() => scrapeHabitFromMind(mind, nodes), [mind, nodes]);
  const [habitRoutine, setHabitRoutine] = useState(scrapedHabit.newRoutine);
  const [habitAnchor, setHabitAnchor] = useState(scrapedHabit.anchorHabit);
  const [habitTiming, setHabitTiming] = useState<"before" | "after">(scrapedHabit.timing);
  const [habitReward, setHabitReward] = useState(scrapedHabit.reward);
  const [habitTopic, setHabitTopic] = useState(scrapedHabit.topic);
  const [habitStreak, setHabitStreak] = useState("7");

  // ── Result state ──
  const [publishedSkill, setPublishedSkill] = useState<SkillEntry | null>(null);
  const [publishedHabit, setPublishedHabit] = useState<Habit | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setWizardStep("review");
    setSkillTitle(scrapedSkill.title);
    setSkillDomain(scrapedSkill.domain);
    setSteps(scrapedSkill.steps);
    setHabitRoutine(scrapedHabit.newRoutine);
    setHabitAnchor(scrapedHabit.anchorHabit);
    setHabitTiming(scrapedHabit.timing);
    setHabitReward(scrapedHabit.reward);
    setHabitTopic(scrapedHabit.topic);
    setPublishedSkill(null);
    setPublishedHabit(null);
    setError(null);
    setIsPublishing(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // ── Step editing helpers (skills) ──
  const updateStep = (idx: number, patch: Partial<SkillStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
  };
  const deleteStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
  };
  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      { order: prev.length + 1, action: "", tool: undefined, why: "", errorIfSkipped: undefined, yesOutcome: undefined, noOutcome: undefined, keywords: [] },
    ]);
  };

  // ── Validation ──
  const skillValid = steps.length > 0 && steps.every((s) => s.action.trim().length > 0) && skillTitle.trim().length > 0;
  const habitValid = habitRoutine.trim().length > 0 && habitAnchor.trim().length > 0 && habitReward.trim().length > 0;

  // ── Publish (skill) ──
  const publishSkill = async () => {
    setIsPublishing(true);
    setError(null);
    try {
      // 1. Create the skill (private) with the edited metadata.
      const created = await skills.createSkillFromMind({
        mindId: mind.id,
        skillMetadata: {
          title: skillTitle.trim(),
          domain: skillDomain.trim() || "general",
          authorName: authorName.trim() || displayNameOr(user),
          authorYearsExperience: authorYears ? parseInt(authorYears, 10) : undefined,
        },
      });

      // 2. Overwrite the auto-extracted steps with the user's edited steps
      //    (the hook extracts from the mind; we let the user edit here).
      const { idb } = await import("@/lib/db");
      const withEditedSteps: SkillEntry = { ...created, steps };
      await idb.put("skills", withEditedSteps);

      // 3. Submit for review (private → in_review).
      await skills.submitForReview(withEditedSteps.id);

      // 4. Publish (in_review → published + sync to Supabase so other
      //    users can find it in real time).
      const published = await skills.approveAndPublish({
        skillId: withEditedSteps.id,
        reviewerId: userIdOr(user),
      });

      setPublishedSkill(published);
      setWizardStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish skill");
    } finally {
      setIsPublishing(false);
    }
  };

  // ── Publish (habit) ──
  const publishHabit = async () => {
    setIsPublishing(true);
    setError(null);
    try {
      // 1. Create the habit (private) with the edited data.
      const created = await habits.createHabit({
        newRoutine: habitRoutine.trim(),
        anchorHabit: habitAnchor.trim(),
        timing: habitTiming,
        reward: habitReward.trim(),
        topic: habitTopic.trim() || "general",
        targetStreak: parseInt(habitStreak, 10) || 7,
      });

      // 2. Submit for review.
      await habits.submitForReview(created.id);

      // 3. Publish + sync to Supabase.
      const published = await habits.approveAndPublish({
        habitId: created.id,
        reviewerId: userIdOr(user),
      });

      setPublishedHabit(published);
      setWizardStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish habit");
    } finally {
      setIsPublishing(false);
    }
  };

  const isSkillMode = mode === "skill";
  const canProceed = isSkillMode ? skillValid : habitValid;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSkillMode ? (
              <>
                <Sparkles className="h-5 w-5 text-primary" />
                Extract &amp; Publish Skill
              </>
            ) : (
              <>
                <Rocket className="h-5 w-5 text-primary" />
                Extract &amp; Publish Habit
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {wizardStep === "review" && (
              <>
                We scraped {isSkillMode ? `${steps.length} step${steps.length === 1 ? "" : "s"}` : "a habit pattern"} from
                “{mind.title}”. Review and edit below, then publish to make it public.
              </>
            )}
            {wizardStep === "preview" && "Preview exactly what other users will see."}
            {wizardStep === "done" && "Published! Your content is now live."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {/* ═══ STEP: REVIEW (edit scraped data) ═══ */}
          {wizardStep === "review" && isSkillMode && (
            <div className="space-y-4 py-2">
              {/* Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="skill-title">Skill title</Label>
                  <Input
                    id="skill-title"
                    value={skillTitle}
                    onChange={(e) => setSkillTitle(e.target.value)}
                    placeholder="e.g., Debugging a Memory Leak"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="skill-domain">Domain</Label>
                  <Input
                    id="skill-domain"
                    value={skillDomain}
                    onChange={(e) => setSkillDomain(e.target.value)}
                    placeholder="e.g., engineering, health, finance"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="author-name">Your name</Label>
                  <Input
                    id="author-name"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="author-years">Years of experience (optional)</Label>
                  <Input
                    id="author-years"
                    type="number"
                    min={0}
                    max={80}
                    value={authorYears}
                    onChange={(e) => setAuthorYears(e.target.value)}
                    placeholder="e.g., 5"
                  />
                </div>
              </div>

              {/* Steps editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Steps ({steps.length}) — scraped from mind outcomes</Label>
                  <Button variant="outline" size="sm" onClick={addStep} type="button">
                    <Plus className="h-3 w-3 mr-1" />
                    Add step
                  </Button>
                </div>
                {steps.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                    This mind has no outcome nodes. Add outcomes (final recommendations) to
                    the mind first, then extract a skill.
                  </div>
                ) : (
                  steps.map((step, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border/50 bg-card/40 p-3 space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <span className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary mt-1">
                          {idx + 1}
                        </span>
                        <Textarea
                          value={step.action}
                          onChange={(e) => updateStep(idx, { action: e.target.value })}
                          placeholder="What should the reader do at this step?"
                          className="min-h-[60px] text-sm"
                        />
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button
                            type="button"
                            aria-label="Move step up"
                            disabled={idx === 0}
                            onClick={() => moveStep(idx, -1)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-30"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label="Move step down"
                            disabled={idx === steps.length - 1}
                            onClick={() => moveStep(idx, 1)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-30"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete step"
                            onClick={() => deleteStep(idx)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <Input
                        value={step.why ?? ""}
                        onChange={(e) => updateStep(idx, { why: e.target.value })}
                        placeholder="Why this step matters (optional)"
                        className="text-xs ml-8"
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {wizardStep === "review" && !isSkillMode && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="font-medium">Habit pattern scraped from this mind:</p>
                <p className="mt-1 text-muted-foreground">
                  “{habitTiming === "after" ? "After" : "Before"} <strong>{habitAnchor}</strong>, I will <strong>{habitRoutine}</strong>”
                  {" "}→ reward: {habitReward}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="habit-routine">New routine (what you'll do)</Label>
                <Textarea
                  id="habit-routine"
                  value={habitRoutine}
                  onChange={(e) => setHabitRoutine(e.target.value)}
                  placeholder="e.g., write 200 words"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="habit-anchor">Anchor habit (existing routine you'll attach to)</Label>
                <Input
                  id="habit-anchor"
                  value={habitAnchor}
                  onChange={(e) => setHabitAnchor(e.target.value)}
                  placeholder="e.g., morning coffee"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Timing</Label>
                  <Select value={habitTiming} onValueChange={(v) => setHabitTiming(v as "before" | "after")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="after">After anchor</SelectItem>
                      <SelectItem value="before">Before anchor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="habit-streak">Target streak (days)</Label>
                  <Input
                    id="habit-streak"
                    type="number"
                    min={1}
                    max={365}
                    value={habitStreak}
                    onChange={(e) => setHabitStreak(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="habit-reward">Reward</Label>
                <Input
                  id="habit-reward"
                  value={habitReward}
                  onChange={(e) => setHabitReward(e.target.value)}
                  placeholder="e.g., check off the streak"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="habit-topic">Topic</Label>
                <Input
                  id="habit-topic"
                  value={habitTopic}
                  onChange={(e) => setHabitTopic(e.target.value)}
                  placeholder="e.g., productivity, health"
                />
              </div>
            </div>
          )}

          {/* ═══ STEP: PREVIEW (what others will see) ═══ */}
          {wizardStep === "preview" && isSkillMode && (
            <div className="space-y-3 py-2">
              <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{skillTitle}</h3>
                    <p className="text-sm text-muted-foreground">
                      {skillDomain} · by {authorName}
                      {authorYears ? ` · ${authorYears}y exp` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-green-500/10 px-2 py-1 text-xs font-medium text-green-600">
                    Published
                  </span>
                </div>
                <ol className="mt-4 space-y-2">
                  {steps.map((step, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{step.action}</p>
                        {step.why ? (
                          <p className="text-xs text-muted-foreground">Why: {step.why}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                This is exactly what other users will see when they search for skills
                in the {skillDomain} domain.
              </p>
            </div>
          )}

          {wizardStep === "preview" && !isSkillMode && (
            <div className="space-y-3 py-2">
              <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{habitRoutine}</h3>
                    <p className="text-sm text-muted-foreground">
                      {habitTopic} · target streak {habitStreak} days
                    </p>
                  </div>
                  <span className="rounded-full bg-green-500/10 px-2 py-1 text-xs font-medium text-green-600">
                    Published
                  </span>
                </div>
                <div className="mt-4 rounded-lg bg-muted/30 p-3 text-sm">
                  <p>
                    <span className="text-muted-foreground">{habitTiming === "after" ? "After" : "Before"}</span>{" "}
                    <strong>{habitAnchor}</strong>
                    <span className="text-muted-foreground">, I will</span>{" "}
                    <strong>{habitRoutine}</strong>
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium">Reward:</span> {habitReward}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                This is exactly what other users will see when they search for habits
                in the {habitTopic} topic.
              </p>
            </div>
          )}

          {/* ═══ STEP: DONE ═══ */}
          {wizardStep === "done" && (
            <div className="py-8 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold">
                  {isSkillMode ? "Skill published!" : "Habit published!"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isSkillMode
                    ? `“${publishedSkill?.title}” is now live and searchable by other users building minds.`
                    : `“${publishedHabit?.newRoutine}” is now live and searchable by other users.`}
                </p>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                Other users can now find this via the @skill / @habit picker in the
                mind node editor, and via search.
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Publish failed</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {wizardStep === "review" && (
            <>
              <Button variant="outline" onClick={handleClose} type="button">
                Cancel
              </Button>
              <Button
                onClick={() => setWizardStep("preview")}
                disabled={!canProceed}
                type="button"
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
            </>
          )}
          {wizardStep === "preview" && (
            <>
              <Button variant="outline" onClick={() => setWizardStep("review")} type="button">
                <Pencil className="h-4 w-4 mr-2" />
                Back to edit
              </Button>
              <Button
                onClick={isSkillMode ? publishSkill : publishHabit}
                disabled={isPublishing}
                type="button"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Publishing…
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    Publish to public
                  </>
                )}
              </Button>
            </>
          )}
          {wizardStep === "done" && (
            <Button onClick={handleClose} type="button">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
