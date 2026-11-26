/**
 * components/onboarding/OnboardingFlow.tsx — Multi-step new-user onboarding.
 *
 * Drives the 5-step onboarding state machine defined in
 * api-server/src/routes/onboarding.ts:
 *   profile -> interests -> personality -> experts -> done
 *
 * Each step:
 *   - Renders its UI.
 *   - On "Next", advances server state via onboardingApi.advance().
 *   - On "Back", allows navigation back to previous step (locally — server
 *     state is forward-only, so we don't call advance on back).
 *
 * The component is designed to be embedded in a full-screen route (e.g.
 * /onboarding) for first-time users. Restart-able: if the user abandons
 * mid-flow and returns, they resume from their last completed step.
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Brain, User, Sparkles, GraduationCap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  onboardingApi,
  personalityApi,
  expertsApi,
  type OnboardingStep,
  type OnboardingState,
  type ExpertApplicationInput,
} from "@/lib/api/community";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Phase = "loading" | "step" | "submitting" | "done";

const STEP_ORDER: OnboardingStep[] = ["profile", "interests", "personality", "experts", "done"];
const STEP_INDEX: Record<OnboardingStep, number> = {
  profile: 0, interests: 1, personality: 2, experts: 3, done: 4,
};

const STEP_META: Record<OnboardingStep, { label: string; icon: typeof User }> = {
  profile:     { label: "Profile",     icon: User           },
  interests:   { label: "Interests",   icon: Sparkles       },
  personality: { label: "Personality", icon: Brain          },
  experts:     { label: "Experts",     icon: GraduationCap  },
  done:        { label: "Done",        icon: CheckCircle2   },
};

interface OnboardingFlowProps {
  /** Called when onboarding completes (or user already done on mount). */
  onComplete?: () => void;
  /** Called when user explicitly skips (optional). */
  onSkip?: () => void;
}

export function OnboardingFlow({ onComplete, onSkip }: OnboardingFlowProps) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<OnboardingState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Scratch state for each step (kept locally, persisted on advance).
  const [profileScratch, setProfileScratch] = useState({
    displayName: "",
    bio: "",
  });
  const [interestsScratch, setInterestsScratch] = useState<string[]>([]);
  const [expertScratch, setExpertScratch] = useState<ExpertApplicationInput | null>(null);

  // ----- Load existing onboarding state on mount ---------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Start an onboarding row if none exists yet.
        await onboardingApi.start();
        const s = await onboardingApi.get();
        if (cancelled) return;
        setState(s);
        if (s.currentStep === "done") {
          onComplete?.();
          return;
        }
        setPhase("step");
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof ApiError
          ? (err.status === 401 ? "Please sign in to continue." : `Server error (${err.status}).`)
          : "Network error.";
        setError(msg);
        setPhase("step");
      }
    })();
    return () => { cancelled = true; };
  }, [onComplete]);

  // ----- Advance to next step ---------------------------------------------
  const advance = useCallback(async (nextStep: OnboardingStep, scratch?: Record<string, unknown>) => {
    if (!state) return;
    setPhase("submitting");
    try {
      await onboardingApi.advance(nextStep, scratch);
      const s = await onboardingApi.get();
      setState(s);
      if (s.currentStep === "done") {
        onComplete?.();
        return;
      }
      setPhase("step");
    } catch (err) {
      setPhase("step");
      const msg = err instanceof ApiError
        ? (err.status === 503 ? "Onboarding updates are temporarily unavailable. Your entries remain in this window only; do not close it if you need to keep them." : `Could not save (${err.status}). Please try again.`)
        : "Network error. Please try again.";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    }
  }, [state, toast, onComplete]);

  // ----- Render -----------------------------------------------------------
  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center space-y-4">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  if (!state) {
    return <p role="status">Onboarding state is unavailable.</p>;
  }

  const currentIndex = STEP_INDEX[state.currentStep];
  const progress = ((currentIndex + 1) / STEP_ORDER.length) * 100;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Stepper */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          {STEP_ORDER.map((step, i) => {
            const meta = STEP_META[step];
            const Icon = meta.icon;
            const isCurrent = i === currentIndex;
            const isDone = i < currentIndex;
            return (
              <div key={step} className={cn(
                "flex flex-col items-center gap-1 transition-all",
                (isCurrent || isDone) ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground",
              )}>
                <div className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center border-2",
                  isCurrent && "border-violet-500 bg-violet-50 dark:bg-violet-950/30",
                  isDone && "border-violet-500 bg-violet-500 text-white",
                  !isCurrent && !isDone && "border-border",
                )}>
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={cn(isCurrent && "font-medium")}>{meta.label}</span>
              </div>
            );
          })}
        </div>
        <Progress value={progress} className="h-1" />
      </div>

      {/* Step body */}
      {state.currentStep === "profile" && (
        <ProfileStep
          scratch={profileScratch}
          setScratch={setProfileScratch}
          phase={phase}
          onBack={onSkip}
          onNext={() => advance("interests", profileScratch)}
        />
      )}

      {state.currentStep === "interests" && (
        <InterestsStep
          scratch={interestsScratch}
          setScratch={setInterestsScratch}
          phase={phase}
          onBack={() => { /* local-only back */ }}
          onNext={() => advance("personality", { interests: interestsScratch })}
        />
      )}

      {state.currentStep === "personality" && (
        <PersonalityStep
          phase={phase}
          onBack={() => { /* local-only back */ }}
          onNext={() => advance("experts")}
        />
      )}

      {state.currentStep === "experts" && (
        <ExpertsStep
          scratch={expertScratch}
          setScratch={setExpertScratch}
          phase={phase}
          onBack={() => { /* local-only back */ }}
          onNext={async () => {
            if (expertScratch) {
              try {
                await expertsApi.submit(expertScratch);
              } catch (err) {
                console.warn("Expert application failed", err);
              }
            }
            advance("done");
          }}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Step components (same file to keep the flow cohesive)
// ===========================================================================

interface ProfileStepProps {
  scratch: { displayName: string; bio: string };
  setScratch: (s: { displayName: string; bio: string }) => void;
  phase: Phase;
  onBack?: () => void;
  onNext: () => void;
}

function ProfileStep({ scratch, setScratch, phase, onBack, onNext }: ProfileStepProps) {
  const valid = scratch.displayName.trim().length >= 2;
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <h2 className="text-xl font-bold">Set up your profile</h2>
        <p className="text-sm text-muted-foreground">
          This is how you'll appear to others in the community.
        </p>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium">Display name *</span>
            <input
              type="text"
              value={scratch.displayName}
              onChange={(e) => setScratch({ ...scratch, displayName: e.target.value })}
              placeholder="e.g. Ada Lovelace"
              maxLength={100}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background"
              disabled={phase === "submitting"}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Bio</span>
            <textarea
              value={scratch.bio}
              onChange={(e) => setScratch({ ...scratch, bio: e.target.value })}
              placeholder="A short intro about you..."
              maxLength={2000}
              rows={3}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background"
              disabled={phase === "submitting"}
            />
          </label>
        </div>
        <StepFooter phase={phase} onBack={onBack} backLabel="Skip for now" onNext={onNext} nextDisabled={!valid} />
      </CardContent>
    </Card>
  );
}

const SUGGESTED_INTERESTS = [
  "Neuroscience", "Philosophy", "Software", "Mathematics", "Physics",
  "History", "Literature", "Economics", "Psychology", "Biology",
  "Chemistry", "Linguistics", "Sociology", "Art", "Music",
];

interface InterestsStepProps {
  scratch: string[];
  setScratch: (s: string[]) => void;
  phase: Phase;
  onBack: () => void;
  onNext: () => void;
}

function InterestsStep({ scratch, setScratch, phase, onBack, onNext }: InterestsStepProps) {
  const toggle = (interest: string) => {
    if (scratch.includes(interest)) {
      setScratch(scratch.filter((i) => i !== interest));
    } else {
      setScratch([...scratch, interest]);
    }
  };
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <h2 className="text-xl font-bold">What are you curious about?</h2>
        <p className="text-sm text-muted-foreground">
          Pick a few topics. We'll use these to seed your feed and recommend
          experts. You can change these later.
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_INTERESTS.map((interest) => {
            const active = scratch.includes(interest);
            return (
              <button
                key={interest}
                type="button"
                onClick={() => toggle(interest)}
                disabled={phase === "submitting"}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm border-2 transition-all",
                  active
                    ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300"
                    : "border-border hover:border-violet-300",
                )}
              >
                {interest}
              </button>
            );
          })}
        </div>
        <StepFooter phase={phase} onBack={onBack} onNext={onNext} nextLabel={scratch.length === 0 ? "Skip" : `Next (${scratch.length} selected)`} />
      </CardContent>
    </Card>
  );
}

interface PersonalityStepProps {
  phase: Phase;
  onBack: () => void;
  onNext: () => void;
}

function PersonalityStep({ phase, onBack, onNext }: PersonalityStepProps) {
  const [hasResult, setHasResult] = useState<boolean | null>(null);

  useEffect(() => {
    personalityApi.get().then((r) => setHasResult(r !== null)).catch(() => setHasResult(false));
  }, []);

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <h2 className="text-xl font-bold">Take the personality test</h2>
        <p className="text-sm text-muted-foreground">
          The BFI-10 takes about 1 minute and helps us match you with mentors
          and content. You can take it now or skip and come back later.
        </p>
        {hasResult === true && (
          <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            You've already taken the test. You can retake it anytime.
          </div>
        )}
        <a href="/personality-test" className="block">
          <Button variant="outline" className="w-full" disabled={phase === "submitting"}>
            <Brain className="h-4 w-4 mr-2" />
            {hasResult ? "Retake test" : "Take test"}
          </Button>
        </a>
        <StepFooter phase={phase} onBack={onBack} onNext={onNext} nextLabel={hasResult ? "Next" : "Skip for now"} />
      </CardContent>
    </Card>
  );
}

interface ExpertsStepProps {
  scratch: ExpertApplicationInput | null;
  setScratch: (s: ExpertApplicationInput | null) => void;
  phase: Phase;
  onBack: () => void;
  onNext: () => void;
}

function ExpertsStep({ scratch, setScratch, phase, onBack, onNext }: ExpertsStepProps) {
  const [enabled, setEnabled] = useState(false);

  const update = (patch: Partial<ExpertApplicationInput>) => {
    const base: ExpertApplicationInput = scratch ?? {
      displayName: "",
      expertise: "",
      credentials: {},
    };
    setScratch({ ...base, ...patch });
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <h2 className="text-xl font-bold">Apply to the expert directory</h2>
        <p className="text-sm text-muted-foreground">
          If you have professional credentials (ORCID, license, etc.), you can
          apply to be listed in our expert directory and mentor others.
          This step is optional.
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={phase === "submitting"}
          />
          <span className="text-sm">I want to apply as an expert</span>
        </label>

        {enabled && (
          <div className="space-y-3 pt-2">
            <label className="block text-sm">
              <span className="font-medium">Display name *</span>
              <input
                type="text"
                value={scratch?.displayName ?? ""}
                onChange={(e) => update({ displayName: e.target.value })}
                maxLength={100}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background"
                disabled={phase === "submitting"}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Area of expertise *</span>
              <input
                type="text"
                value={scratch?.expertise ?? ""}
                onChange={(e) => update({ expertise: e.target.value })}
                placeholder="e.g. Cardiology"
                maxLength={100}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background"
                disabled={phase === "submitting"}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">ORCID (optional)</span>
              <input
                type="text"
                value={(scratch?.credentials as { orcid?: string })?.orcid ?? ""}
                onChange={(e) => update({ credentials: { ...scratch?.credentials, orcid: e.target.value } })}
                placeholder="0000-0001-2345-6789"
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background"
                disabled={phase === "submitting"}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Your application enters a human review queue. We'll notify you
              when it's approved.
            </p>
          </div>
        )}

        <StepFooter phase={phase} onBack={onBack} onNext={onNext} nextLabel="Finish" />
      </CardContent>
    </Card>
  );
}

interface StepFooterProps {
  phase: Phase;
  onBack?: () => void;
  onNext: () => void;
  backLabel?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
}

function StepFooter({ phase, onBack, onNext, backLabel = "Back", nextLabel = "Next", nextDisabled }: StepFooterProps) {
  const submitting = phase === "submitting";
  return (
    <div className="flex gap-2 pt-2">
      {onBack && (
        <Button variant="ghost" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {backLabel}
        </Button>
      )}
      <Button onClick={onNext} disabled={submitting || nextDisabled} className="ml-auto">
        {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1" />}
        {nextLabel}
      </Button>
    </div>
  );
}

export default OnboardingFlow;
