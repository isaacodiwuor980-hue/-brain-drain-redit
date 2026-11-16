import { useState } from "react";
import { useDailyChallenges } from "@/hooks/use-daily-challenges";
import { DailyChallenge } from "@/lib/extension-types";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import {
  Flame,
  CheckCircle2,
  Clock,
  Sparkles,
  HelpCircle,
  Award,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { triggerHaptic } from "@/lib/device";
import { useToast } from "@/hooks/use-toast";

export function DailyChallengesSection() {
  const { challenges, attempts, isLoading, submitAttempt, isSubmitting } = useDailyChallenges();
  const { toast } = useToast();
  const [activeChallenge, setActiveChallenge] = useState<DailyChallenge | null>(null);
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [attemptOutcome, setAttemptOutcome] = useState<{
    score: number;
    xpEarned: number;
    isSuccessful: boolean;
  } | null>(null);

  if (isLoading) {
    return (
      <div className="p-6 rounded-2xl border border-border/40 bg-card animate-pulse space-y-3">
        <div className="h-5 w-48 bg-muted rounded-md" />
        <div className="h-20 bg-muted/50 rounded-xl" />
      </div>
    );
  }

  const handleStartChallenge = (challenge: DailyChallenge) => {
    triggerHaptic("selection");
    setActiveChallenge(challenge);
    setCurrentScenarioIndex(0);
    setSelectedAnswers({});
    setShowResults(false);
    setAttemptOutcome(null);
  };

  const handleSelectOption = (scenarioId: string, optionId: string) => {
    triggerHaptic("light");
    setSelectedAnswers((prev) => ({
      ...prev,
      [scenarioId]: optionId,
    }));
  };

  const handleNextOrSubmit = async () => {
    if (!activeChallenge) return;
    const currentScenario = activeChallenge.scenarios[currentScenarioIndex];
    if (!selectedAnswers[currentScenario.id]) return;

    if (currentScenarioIndex < activeChallenge.scenarios.length - 1) {
      triggerHaptic("selection");
      setCurrentScenarioIndex((prev) => prev + 1);
    } else {
      // Final submission
      try {
        const result = await submitAttempt({
          challengeId: activeChallenge.id,
          answers: selectedAnswers,
          timeSpentSeconds: 45,
        });

        triggerHaptic(result.isSuccessful ? "success" : "warning");
        setAttemptOutcome({
          score: result.score,
          xpEarned: result.xpEarned,
          isSuccessful: result.isSuccessful,
        });
        setShowResults(true);
      } catch (error) {
        toast({ title: "Couldn't submit attempt", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
      }
    }
  };

  return (
    <div id="daily-challenges-extension-container" className="space-y-4">
      {/* Header Banner */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground tracking-tight">
              Daily Cognitive Scenarios
            </h3>
            <p className="text-xs text-muted-foreground">
              Test mental models, earn reasoning XP, and build streak momentum
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold px-2.5 py-1 rounded-full border-none">
          Daily Reset
        </Badge>
      </div>

      {/* Main Challenge Interface */}
      {!activeChallenge ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {challenges.map((challenge) => {
            const attempt = attempts.find((a) => a.challengeId === challenge.id);
            const isCompleted = !!attempt?.isCompleted;

            return (
              <Card
                key={challenge.id}
                id={`challenge-card-${challenge.id}`}
                className="p-4 rounded-2xl border-border/60 bg-card hover:border-amber-500/40 transition-all flex flex-col justify-between gap-3 group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {challenge.category}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 rounded-full capitalize">
                        {challenge.difficulty}
                      </Badge>
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> +{challenge.rewardXp} XP
                      </span>
                    </div>
                  </div>

                  <h4 className="font-bold text-sm sm:text-[15px] text-foreground leading-snug group-hover:text-amber-500 transition-colors">
                    {challenge.title}
                  </h4>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {challenge.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {challenge.scenarios.length} questions
                  </span>

                  {isCompleted ? (
                    <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Completed ({attempt.score}%)</span>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleStartChallenge(challenge)}
                      className="rounded-full text-xs h-7 px-3.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold gap-1"
                    >
                      <span>Start Challenge</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Active Challenge Runner Mode */
        <Card className="p-5 rounded-2xl border-amber-500/30 bg-card space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground gap-1"
              onClick={() => setActiveChallenge(null)}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
            <div className="text-xs font-semibold text-muted-foreground">
              Scenario {currentScenarioIndex + 1} of {activeChallenge.scenarios.length}
            </div>
          </div>

          {!showResults ? (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-base text-foreground leading-snug">
                  {activeChallenge.scenarios[currentScenarioIndex].prompt}
                </h4>
              </div>

              <div className="space-y-2.5">
                {activeChallenge.scenarios[currentScenarioIndex].options.map((option) => {
                  const isSelected =
                    selectedAnswers[activeChallenge.scenarios[currentScenarioIndex].id] === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        handleSelectOption(
                          activeChallenge.scenarios[currentScenarioIndex].id,
                          option.id,
                        )
                      }
                      className={`w-full text-left p-3.5 rounded-xl border text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                        isSelected
                          ? "border-amber-500 bg-amber-500/10 text-foreground ring-1 ring-amber-500"
                          : "border-border/60 bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-border/40 flex justify-end">
                <Button
                  disabled={
                    !selectedAnswers[activeChallenge.scenarios[currentScenarioIndex].id] || isSubmitting
                  }
                  onClick={handleNextOrSubmit}
                  className="rounded-full text-xs font-semibold px-5 h-8 bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {currentScenarioIndex < activeChallenge.scenarios.length - 1
                    ? "Next Question"
                    : isSubmitting
                    ? "Submitting..."
                    : "Complete Scenario"}
                </Button>
              </div>
            </div>
          ) : (
            /* Results Breakdown */
            <div className="text-center py-4 space-y-3">
              {attemptOutcome?.isSuccessful ? (
                <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto">
                  <Award className="w-6 h-6" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto">
                  <HelpCircle className="w-6 h-6" />
                </div>
              )}

              <h4 className="font-bold text-lg text-foreground">
                {attemptOutcome?.isSuccessful ? "Scenario Solved!" : "Nice Effort!"}
              </h4>

              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                You achieved a score of <strong>{attemptOutcome?.score}%</strong> and earned{" "}
                <strong className="text-amber-500">+{attemptOutcome?.xpEarned} Reasoning XP</strong>.
              </p>

              <div className="pt-2">
                <Button
                  onClick={() => setActiveChallenge(null)}
                  className="rounded-full text-xs font-semibold h-8 px-6"
                >
                  Continue Learning
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
