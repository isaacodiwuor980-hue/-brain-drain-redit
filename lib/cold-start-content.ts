/**
 * cold-start-content.ts — Phase 5 (Pre-Populated Feed)
 *
 * 12 high-quality starter posts (2 per topic × 6 topics) seeded into a
 * brand-new user's IDB so the feed is never blank on first launch.
 */

import type { Post } from "@/lib/types";

const now = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const COLD_START_POSTS: Post[] = [
  // === Engineering (t1) ===
  {
    id: "cold-eng-1",
    userId: "cold-eng-alice",
    topicId: "t1",
    content: "What's the single most valuable testing strategy you've adopted for React component libraries that ship to multiple consumers?",
    postType: "question",
    questionDetails: "Looking beyond Jest + Testing Library — what about visual regression, accessibility, and contract testing for component APIs?",
    communityName: "Engineering",
    communityId: "comm-eng",
    commentCount: 12,
    reactions: { upvote: 89, downvote: 1 },
    createdAt: now - 2 * HOUR,
  },
  {
    id: "cold-eng-2",
    userId: "cold-eng-bob",
    topicId: "t1",
    content: "After 3 years of microservices, here's the pattern that finally clicked: ship a modular monolith first, extract services only when the team structure demands it.\n\nThe biggest win wasn't technical — it was reducing the cognitive load of cross-service debugging for on-call engineers.",
    postType: "answer",
    answeredQuestionTitle: "When did microservices actually pay off for your team?",
    answeredQuestionAuthor: "Curious Engineer",
    communityName: "Engineering",
    communityId: "comm-eng",
    commentCount: 7,
    reactions: { upvote: 156, downvote: 3 },
    createdAt: now - 6 * HOUR,
  },

  // === Philosophy (t2) ===
  {
    id: "cold-phil-1",
    userId: "cold-phil-marco",
    topicId: "t2",
    content: "If a decision mind encodes heuristics from multiple experts with conflicting approaches, how should tie-breaking be modeled?",
    postType: "question",
    questionDetails: "Comparing Bayesian updating, weighted epistemic confidence scores, and minimax regret models for automated triage.",
    communityName: "Philosophy",
    communityId: "comm-philosophy",
    commentCount: 29,
    reactions: { upvote: 200, downvote: 4 },
    createdAt: now - 1 * DAY,
  },
  {
    id: "cold-phil-2",
    userId: "cold-phil-sarah",
    topicId: "t2",
    content: "The map is not the territory, but a good map is worth a thousand unstructured observations.\n\nThe value of a decision mind isn't that it captures reality perfectly — it's that it forces the decision-maker to make their assumptions explicit and falsifiable.",
    postType: "answer",
    answeredQuestionTitle: "Is structured decision-making actually better than intuition?",
    answeredQuestionAuthor: "Skeptic",
    communityName: "Philosophy",
    communityId: "comm-philosophy",
    commentCount: 18,
    reactions: { upvote: 142, downvote: 2 },
    createdAt: now - 1 * DAY - 4 * HOUR,
  },

  // === React (t3) ===
  {
    id: "cold-react-1",
    userId: "cold-react-alex",
    topicId: "t3",
    content: "What is the cleanest way to structure async state transitions in large React apps without state synchronization bugs?",
    postType: "question",
    questionDetails: "In large applications with suspense boundaries and optimistic updates, what design patterns have yielded the most robust outcomes for your teams?",
    communityName: "React / Frontend",
    communityId: "comm-react",
    commentCount: 14,
    reactions: { upvote: 104, downvote: 2 },
    createdAt: now - 1 * HOUR,
    mindId: "dummy-mind-1",
  },
  {
    id: "cold-react-2",
    userId: "cold-react-jess",
    topicId: "t3",
    content: "Stop using useEffect for data fetching. Use a query library (TanStack Query, SWR, RTK Query) — they handle caching, dedup, refetching, and race conditions for free.\n\nThe biggest React anti-pattern I still see is hand-rolled useEffect + useState data fetching. We have better tools.",
    postType: "answer",
    answeredQuestionTitle: "What's the #1 React anti-pattern you still see?",
    answeredQuestionAuthor: "Frustrated Reviewer",
    communityName: "React / Frontend",
    communityId: "comm-react",
    commentCount: 23,
    reactions: { upvote: 187, downvote: 8 },
    createdAt: now - 8 * HOUR,
  },

  // === AI Safety (ai-safety) ===
  {
    id: "cold-ai-1",
    userId: "cold-ai-elena",
    topicId: "ai-safety",
    content: "What's the most under-discussed failure mode in current LLM deployments that you think will become critical in the next 12 months?",
    postType: "question",
    questionDetails: "Not the existential risks — the practical ones: prompt injection at scale, training data leakage via tool calls, reward hacking in agentic loops.",
    communityName: "AI Safety",
    communityId: "comm-ai",
    commentCount: 31,
    reactions: { upvote: 245, downvote: 5 },
    createdAt: now - 3 * HOUR,
  },
  {
    id: "cold-ai-2",
    userId: "cold-ai-rafael",
    topicId: "ai-safety",
    content: "The biggest under-discussed risk: silent capability regression. When you update a model, the benchmark scores go up, but specific behaviors (refusals, tool-call formats, structured output adherence) can silently degrade.\n\nWe need behavior-level regression tests, not just capability benchmarks.",
    postType: "answer",
    answeredQuestionTitle: "What's the most under-discussed LLM failure mode?",
    answeredQuestionAuthor: "Elena Rostova",
    communityName: "AI Safety",
    communityId: "comm-ai",
    commentCount: 19,
    reactions: { upvote: 178, downvote: 2 },
    createdAt: now - 5 * HOUR,
  },

  // === Health (health) ===
  {
    id: "cold-health-1",
    userId: "cold-health-dr-priya",
    topicId: "health",
    content: "How should we model the decision boundary between lifestyle intervention and pharmacological treatment for borderline hypertension?",
    postType: "question",
    questionDetails: "Particularly interested in how decision minds could encode the multi-factorial trade-offs (age, comorbidities, patient preference, cost).",
    communityName: "Health",
    communityId: "comm-health",
    commentCount: 16,
    reactions: { upvote: 98, downvote: 0 },
    createdAt: now - 4 * HOUR,
  },
  {
    id: "cold-health-2",
    userId: "cold-health-dr-marcus",
    topicId: "health",
    content: "The decision boundary should explicitly encode patient values, not just clinical thresholds. Two patients with identical BP readings may rationally choose different interventions based on their tolerance for daily medication vs. lifestyle change.\n\nThis is exactly the kind of decision where a structured mind outperforms a single clinician's intuition.",
    postType: "answer",
    answeredQuestionTitle: "Lifestyle vs. medication for borderline hypertension?",
    answeredQuestionAuthor: "Dr. Priya",
    communityName: "Health",
    communityId: "comm-health",
    commentCount: 11,
    reactions: { upvote: 76, downvote: 1 },
    createdAt: now - 9 * HOUR,
  },

  // === Finance (finance) ===
  {
    id: "cold-fin-1",
    userId: "cold-fin-tara",
    topicId: "finance",
    content: "What's the single most underrated risk in index fund investing that retail investors systematically ignore?",
    postType: "question",
    questionDetails: "Beyond the usual 'past performance ≠ future results' — think about concentration risk, sector rotation, and index methodology changes.",
    communityName: "Finance",
    communityId: "comm-finance",
    commentCount: 22,
    reactions: { upvote: 134, downvote: 3 },
    createdAt: now - 7 * HOUR,
  },
  {
    id: "cold-fin-2",
    userId: "cold-fin-victor",
    topicId: "finance",
    content: "Concentration risk in market-cap-weighted indices. The top 10 stocks in the S&P 500 now represent over 35% of the index. You're not as diversified as the '500 stocks' marketing suggests.\n\nDecision mind idea: encode a 'true diversification score' that weights by sector exposure, not just market cap.",
    postType: "answer",
    answeredQuestionTitle: "Most underrated risk in index investing?",
    answeredQuestionAuthor: "Tara",
    communityName: "Finance",
    communityId: "comm-finance",
    commentCount: 14,
    reactions: { upvote: 167, downvote: 4 },
    createdAt: now - 12 * HOUR,
  },

  // === Career (career) ===
  {
    id: "cold-career-1",
    userId: "cold-career-mira",
    topicId: "career",
    content: "When should a senior IC take the management track vs. staying technical? What decision framework would actually help here?",
    postType: "question",
    questionDetails: "Most career advice is generic. Looking for a structured decision mind that weighs leverage, learning rate, compensation ceiling, and personal energy source.",
    communityName: "Career",
    communityId: "comm-career",
    commentCount: 27,
    reactions: { upvote: 198, downvote: 2 },
    createdAt: now - 10 * HOUR,
  },
  {
    id: "cold-career-2",
    userId: "cold-career-david",
    topicId: "career",
    content: "The question isn't 'should I be a manager' — it's 'what's my highest-leverage constraint right now'.\n\nIf the constraint is team throughput, management may be the answer. If the constraint is technical depth, staying IC is. If the constraint is compensation, the answer is often 'change companies' rather than change roles.\n\nBuild a mind that surfaces the actual constraint, not the role.",
    postType: "answer",
    answeredQuestionTitle: "IC vs. management — what's the real decision?",
    answeredQuestionAuthor: "Mira",
    communityName: "Career",
    communityId: "comm-career",
    commentCount: 18,
    reactions: { upvote: 211, downvote: 5 },
    createdAt: now - 14 * HOUR,
  },
];

const BANNER_DISMISSAL_KEY = "MindSpool-cold-start-banner-dismissed";

/** Show the cold-start banner when the user follows <3 topics and hasn't dismissed it. */
export function shouldShowColdStartBanner(followedTopicCount: number): boolean {
  if (followedTopicCount >= 3) return false;
  try {
    return localStorage.getItem(BANNER_DISMISSAL_KEY) !== "1";
  } catch {
    return true;
  }
}

export function dismissColdStartBanner(): void {
  try {
    localStorage.setItem(BANNER_DISMISSAL_KEY, "1");
  } catch {
    // Ignore storage failures (private mode).
  }
}
