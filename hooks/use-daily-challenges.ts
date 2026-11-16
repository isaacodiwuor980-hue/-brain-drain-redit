import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DailyChallenge, UserChallengeAttempt } from "../lib/extension-types";
import { idb } from "../lib/db";
import { useReputation } from "./use-reputation";
import { useAuth } from "@/components/auth/AuthContext";
import { userIdOr } from "@/lib/user-data";

const SEED_DAILY_CHALLENGES: DailyChallenge[] = [
  {
    id: "challenge-2026-08-29-react",
    dateString: new Date().toISOString().split("T")[0],
    title: "Diagnostic: Memory Leak in Event Bus Graph",
    description: "Identify the critical node where cyclic reference prevents garbage collection in a real-time decision graph.",
    category: "Architecture",
    difficulty: "intermediate",
    type: "diagnostic_tree",
    rewardXp: 150,
    timeLimitSeconds: 180,
    createdAt: Date.now(),
    scenarios: [
      {
        id: "sc-1",
        prompt: "A subscriber registers a listener to a root decision node without an unsubscription hook on teardown. What happens during rapid state switches?",
        options: [
          {
            id: "opt-1a",
            label: "The listener automatically terminates upon garbage collector sweep.",
            explanation: "Incorrect. Strong reference retained by the root event emitter keeps the listener active in memory.",
            isCorrect: false,
          },
          {
            id: "opt-1b",
            label: "The listener retains the enclosing lexical closure, leading to memory accumulation and redundant executions.",
            explanation: "Correct! Closures retained by long-lived emitter instances cause detached DOM/tree memory leaks.",
            isCorrect: true,
          },
          {
            id: "opt-1c",
            label: "The JavaScript runtime promotes the node to WebWorker isolate.",
            explanation: "Incorrect. Runtime does not mutate thread models dynamically.",
            isCorrect: false,
          },
        ],
      },
      {
        id: "sc-2",
        prompt: "How do you enforce deterministic disposal in a graph-based state engine?",
        options: [
          {
            id: "opt-2a",
            label: "Use WeakRef and FinalizationRegistry or explicit AbortController signal propagation across child nodes.",
            explanation: "Correct! Weak references or explicit AbortSignal propagation guarantee lifecycle-bound teardown.",
            isCorrect: true,
          },
          {
            id: "opt-2b",
            label: "Restart the browser tab on every 50th execution.",
            explanation: "Incorrect. Tab reload is not an architectural solution.",
            isCorrect: false,
          },
        ],
      },
    ],
  },
  {
    id: "challenge-2026-08-29-inference",
    dateString: new Date().toISOString().split("T")[0],
    title: "Epistemic Tie-Breaking in Conflicting Heuristics",
    description: "Resolve an epistemic divergence where two specialist decision models recommend opposite clinical actions.",
    category: "Philosophy & AI",
    difficulty: "advanced",
    type: "causal_inference",
    rewardXp: 200,
    timeLimitSeconds: 240,
    createdAt: Date.now(),
    scenarios: [
      {
        id: "sc-3",
        prompt: "Model A exhibits 92% historical precision on narrow domain cases, while Model B exhibits 81% precision but higher entropy across edge cases. When inputs cross the domain boundary, which weighting algorithm minimizes Bayesian risk?",
        options: [
          {
            id: "opt-3a",
            label: "Strict majority vote unweighted by epistemic uncertainty.",
            explanation: "Incorrect. Simple majority ignores boundary condition confidence drops.",
            isCorrect: false,
          },
          {
            id: "opt-3b",
            label: "Epistemic uncertainty-weighted ensemble with Out-of-Distribution (OOD) penalty weighting.",
            explanation: "Correct! Scaling weights by inverse variance and OOD detection minimizes catastrophe probability.",
            isCorrect: true,
          },
        ],
      },
    ],
  },
];

export function useDailyChallenges() {
  const queryClient = useQueryClient();
  const { addXPEvent } = useReputation();
  // Phase 2: real user ID for challenge attempts.
  const { user } = useAuth();
  const currentUserId = userIdOr(user);
  const todayString = new Date().toISOString().split("T")[0];

  const {
    data: challenges = [],
    isLoading: isLoadingChallenges,
  } = useQuery({
    queryKey: ["daily_challenges", todayString],
    queryFn: async () => {
      const stored = await idb.getAll<DailyChallenge>("daily_challenges");
      if (stored.length === 0) {
        await idb.putAll("daily_challenges", SEED_DAILY_CHALLENGES);
        return SEED_DAILY_CHALLENGES;
      }
      return stored;
    },
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: attempts = [],
    isLoading: isLoadingAttempts,
  } = useQuery({
    queryKey: ["user_challenge_attempts"],
    queryFn: async () => {
      return idb.getAll<UserChallengeAttempt>("user_challenge_attempts");
    },
  });

  const submitAttemptMutation = useMutation({
    mutationFn: async ({
      challengeId,
      answers,
      timeSpentSeconds,
    }: {
      challengeId: string;
      answers: Record<string, string>;
      timeSpentSeconds: number;
    }) => {
      const challenge = challenges.find((c) => c.id === challengeId);
      if (!challenge) throw new Error("Challenge not found");

      let correctCount = 0;
      challenge.scenarios.forEach((sc) => {
        const selectedOptId = answers[sc.id];
        const correctOpt = sc.options.find((opt) => opt.isCorrect);
        if (selectedOptId === correctOpt?.id) {
          correctCount++;
        }
      });

      const totalScenarios = challenge.scenarios.length;
      const score = Math.round((correctCount / (totalScenarios || 1)) * 100);
      const isSuccessful = score >= 70;
      const xpEarned = isSuccessful ? challenge.rewardXp : Math.round(challenge.rewardXp * 0.25);

      const attempt: UserChallengeAttempt = {
        id: `${currentUserId}_${challengeId}`,
        userId: currentUserId,
        challengeId,
        dateString: todayString,
        answers,
        isCompleted: true,
        isSuccessful,
        score,
        timeSpentSeconds,
        xpEarned,
        completedAt: Date.now(),
      };

      await idb.put("user_challenge_attempts", attempt);

      if (xpEarned > 0) {
        await addXPEvent(
          "mission_completed",
          xpEarned,
          `Daily Challenge: ${challenge.title} (${score}%)`
        );
      }

      return attempt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_challenge_attempts"] });
      queryClient.invalidateQueries({ queryKey: ["reputationData"] });
    },
  });

  return {
    challenges,
    attempts,
    isLoading: isLoadingChallenges || isLoadingAttempts,
    todayString,
    submitAttempt: submitAttemptMutation.mutateAsync,
    isSubmitting: submitAttemptMutation.isPending,
  };
}
