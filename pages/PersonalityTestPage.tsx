/**
 * pages/PersonalityTestPage.tsx — BFI-10 personality test (Rammstedt & John, 2007).
 *
 * 10 items, 5 traits (2 items each, 1 reverse-keyed), 1-5 Likert scale.
 * Takes ~1 minute to complete. Scores are computed server-side to prevent
 * tampering (see api-server/src/routes/personality.ts).
 *
 * Reference:
 *   Rammstedt, B., & John, O. P. (2007). Measuring personality in one
 *   minute or less: A 10-item short version of the Big Five Inventory in
 *   English and German. Journal of Research in Personality, 41, 203-212.
 */
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Brain, CheckCircle2, ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { personalityApi, type Bfi10Responses, type PersonalityResult } from "@/lib/api/community";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/device";

// ===========================================================================
// BFI-10 item bank
// ===========================================================================
// Each item: id (matches the responses schema), text, trait, reverseKeyed.
// Standard BFI-10 wording (shortened to fit mobile).

interface Bfi10Item {
  id: keyof Bfi10Responses;
  text: string;
  trait: "extraversion" | "agreeableness" | "conscientiousness" | "neuroticism" | "openness";
  reverseKeyed: boolean;
}

const ITEMS: Bfi10Item[] = [
  { id: "e1",  text: "I see myself as someone who is talkative.",                       trait: "extraversion",      reverseKeyed: false },
  { id: "e2r", text: "I see myself as someone who tends to be reserved.",               trait: "extraversion",      reverseKeyed: true  },
  { id: "a1",  text: "I see myself as someone who is generally trusting.",              trait: "agreeableness",     reverseKeyed: false },
  { id: "a2r", text: "I see myself as someone who tends to find fault with others.",    trait: "agreeableness",     reverseKeyed: true  },
  { id: "c1",  text: "I see myself as someone who does a thorough job.",                trait: "conscientiousness", reverseKeyed: false },
  { id: "c2r", text: "I see myself as someone who tends to be lazy.",                   trait: "conscientiousness", reverseKeyed: true  },
  { id: "n1",  text: "I see myself as someone who is relaxed, handles stress well.",    trait: "neuroticism",       reverseKeyed: true  },
  { id: "n2r", text: "I see myself as someone who gets nervous easily.",                trait: "neuroticism",       reverseKeyed: false },
  { id: "o1",  text: "I see myself as someone who has an active imagination.",          trait: "openness",          reverseKeyed: false },
  { id: "o2r", text: "I see myself as someone who has few artistic interests.",         trait: "openness",          reverseKeyed: true  },
];

const LIKERT_LABELS: { value: number; label: string; short: string }[] = [
  { value: 1, label: "Strongly disagree", short: "SD" },
  { value: 2, label: "Disagree",           short: "D"  },
  { value: 3, label: "Neutral",            short: "N"  },
  { value: 4, label: "Agree",              short: "A"  },
  { value: 5, label: "Strongly agree",     short: "SA" },
];

const TRAIT_INFO: Record<Bfi10Item["trait"], { label: string; description: string; color: string }> = {
  extraversion:      { label: "Extraversion",       description: "Sociability, energy, positive affect.",   color: "bg-amber-500"  },
  agreeableness:     { label: "Agreeableness",      description: "Trust, altruism, cooperation.",            color: "bg-emerald-500"},
  conscientiousness: { label: "Conscientiousness",  description: "Self-discipline, order, diligence.",      color: "bg-blue-500"   },
  neuroticism:       { label: "Neuroticism",        description: "Emotional instability, anxiety.",         color: "bg-rose-500"   },
  openness:          { label: "Openness",           description: "Imagination, curiosity, creativity.",     color: "bg-violet-500" },
};

// ===========================================================================
// Page component
// ===========================================================================

type Phase = "intro" | "test" | "submitting" | "result";

export default function PersonalityTestPage() {
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>("intro");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Partial<Bfi10Responses>>({});
  const [result, setResult] = useState<PersonalityResult | null>(null);
  const [existingResult, setExistingResult] = useState<PersonalityResult | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // Load any existing result on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await personalityApi.get();
        if (cancelled) return;
        setExistingResult(r);
      } catch (err) {
        // 401 etc. — just leave existingResult null.
        if (err instanceof ApiError && err.status !== 401) {
          // network or 5xx — quietly ignore; user can still take the test.
        }
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // B7: auto-advance timer ref — cleared before re-arming and on unmount, so
  // a fast double-tap can't stack two timers (double-advance bug) and an
  // unmount can't set state on a dead component.
  const advanceTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
  }, []);

  const handleAnswer = (value: number) => {
    const item = ITEMS[currentIndex];
    setResponses((prev) => ({ ...prev, [item.id]: value }));
    triggerHaptic?.("light");

    // Auto-advance after a short delay so the user sees their selection.
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = window.setTimeout(() => {
      if (currentIndex < ITEMS.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleSubmit({ ...responses, [item.id]: value });
      }
    }, 250);
  };

  const handleSubmit = async (finalResponses: Partial<Bfi10Responses>) => {
    // Validate all 10 keys present.
    const required: (keyof Bfi10Responses)[] = ["e1","e2r","a1","a2r","c1","c2r","n1","n2r","o1","o2r"];
    const missing = required.filter((k) => finalResponses[k] === undefined);
    if (missing.length > 0) {
      toast({
        title: "Incomplete test",
        description: `Please answer all questions. Missing: ${missing.length}`,
        variant: "destructive",
      });
      return;
    }

    setPhase("submitting");
    try {
      const r = await personalityApi.submit(finalResponses as Bfi10Responses);
      // Re-fetch the persisted result to get the canonical id + createdAt.
      const fetched = await personalityApi.get();
      setResult(fetched);
      setExistingResult(fetched);
      setPhase("result");
      triggerHaptic?.("success");
      toast({
        title: "Personality saved",
        description: `Scores: E=${r.scores.extraversion} A=${r.scores.agreeableness} C=${r.scores.conscientiousness} N=${r.scores.neuroticism} O=${r.scores.openness}`,
      });
    } catch (err) {
      setPhase("test");
      const msg = err instanceof ApiError
        ? (err.status === 401 ? "Please sign in to save your results." : `Server error (${err.status}).`)
        : "Network error. Please try again.";
      toast({ title: "Could not save", description: msg, variant: "destructive" });
    }
  };

  const handleRetake = () => {
    setResponses({});
    setCurrentIndex(0);
    setResult(null);
    setPhase("intro");
  };

  // =========================================================================
  // Render
  // =========================================================================

  if (loadingExisting) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ----- Phase: intro -----------------------------------------------------
  if (phase === "intro") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
            <Brain className="h-8 w-8 text-violet-600 dark:text-violet-400" />
          </div>
          <h1 className="text-2xl font-bold">Big Five Personality Test</h1>
          <p className="text-muted-foreground">
            10 questions · about 1 minute · based on the BFI-10 (Rammstedt &amp; John, 2007)
          </p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-3 text-sm">
            <p>
              You'll rate how well 10 short statements describe you, on a 1-5 scale.
              Your answers compute five trait scores that power personalized
              mentorship matching and content recommendations.
            </p>
            <p className="text-muted-foreground">
              Your responses are scored and stored server-side. You can retake
              the test at any time; only your most recent result is used.
            </p>
            {existingResult && (
              <div className="mt-4 p-3 rounded-md bg-muted text-xs space-y-1">
                <div className="font-medium">Last result ({new Date(existingResult.createdAt).toLocaleDateString()}):</div>
                <div className="grid grid-cols-5 gap-1 text-center">
                  <TraitBadge trait="extraversion"      value={existingResult.extraversion} />
                  <TraitBadge trait="agreeableness"     value={existingResult.agreeableness} />
                  <TraitBadge trait="conscientiousness" value={existingResult.conscientiousness} />
                  <TraitBadge trait="neuroticism"       value={existingResult.neuroticism} />
                  <TraitBadge trait="openness"          value={existingResult.openness} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          className="w-full"
          size="lg"
          onClick={() => { setPhase("test"); setCurrentIndex(0); }}
        >
          {existingResult ? "Retake test" : "Start test"}
        </Button>
      </div>
    );
  }

  // ----- Phase: test ------------------------------------------------------
  if (phase === "test" || phase === "submitting") {
    const item = ITEMS[currentIndex];
    const progress = ((currentIndex + 1) / ITEMS.length) * 100;
    const selected = responses[item.id];

    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {currentIndex > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentIndex(currentIndex - 1)}
              disabled={phase === "submitting"}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          <span className="ml-auto">Question {currentIndex + 1} of {ITEMS.length}</span>
        </div>

        <Progress value={progress} className="h-1" />

        <Card className={cn("transition-all", phase === "submitting" && "opacity-60")}>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-start gap-3">
              <div className={cn("mt-1 h-2 w-2 rounded-full shrink-0", TRAIT_INFO[item.trait].color)} />
              <h2 className="text-lg font-medium leading-snug">
                {item.text}
              </h2>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {LIKERT_LABELS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={phase === "submitting"}
                  onClick={() => handleAnswer(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all",
                    "hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20",
                    selected === opt.value
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                      : "border-border",
                  )}
                >
                  <span className="text-xs font-bold">{opt.short}</span>
                  <span className="text-[10px] leading-tight text-muted-foreground text-center">
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>

            {phase === "submitting" && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving your answers…
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-5 gap-2 text-center text-[10px] text-muted-foreground">
          <span>Disagree strongly</span>
          <span>Disagree</span>
          <span>Neutral</span>
          <span>Agree</span>
          <span>Agree strongly</span>
        </div>
      </div>
    );
  }

  // ----- Phase: result ----------------------------------------------------
  if (phase === "result" && result) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold">Your Big Five Profile</h1>
          <p className="text-sm text-muted-foreground">
            Saved {new Date(result.createdAt).toLocaleString()}
          </p>
        </div>

        <div className="space-y-3">
          <TraitBar trait="extraversion"      value={result.extraversion} />
          <TraitBar trait="agreeableness"     value={result.agreeableness} />
          <TraitBar trait="conscientiousness" value={result.conscientiousness} />
          <TraitBar trait="neuroticism"       value={result.neuroticism} />
          <TraitBar trait="openness"          value={result.openness} />
        </div>

        <Card>
          <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
            <p>
              Scores are on a 1.0-5.0 scale (1 = low, 5 = high). Each trait is
              computed from two BFI-10 items, one of which is reverse-keyed.
            </p>
            <p>
              Reference: Rammstedt, B., &amp; John, O. P. (2007). Measuring
              personality in one minute or less: A 10-item short version of
              the Big Five Inventory in English and German. <em>Journal of
              Research in Personality, 41</em>, 203-212.
            </p>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRetake} className="flex-1">
            <RotateCcw className="h-4 w-4 mr-2" /> Retake
          </Button>
          <Button
            className="flex-1"
            onClick={() => window.history.back()}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

// ===========================================================================
// Helper components
// ===========================================================================

function TraitBadge({ trait, value }: { trait: Bfi10Item["trait"]; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] text-muted-foreground">{TRAIT_INFO[trait].label.slice(0, 3)}</span>
      <span className="font-bold text-sm">{value.toFixed(1)}</span>
    </div>
  );
}

function TraitBar({ trait, value }: { trait: Bfi10Item["trait"]; value: number }) {
  const info = TRAIT_INFO[trait];
  const pct = ((value - 1) / 4) * 100; // 1.0 -> 0%, 5.0 -> 100%
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">{info.label}</span>
          <span className="text-sm font-bold tabular-nums">{value.toFixed(2)}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", info.color)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{info.description}</p>
      </CardContent>
    </Card>
  );
}
