/**
 * Feature Flags and Types for Phase 1-6 Extensions
 * Zero breaking changes to existing types
 */

export interface FeatureFlags {
  enable_gamification: boolean;
  enable_daily_challenges: boolean;
  enable_leaderboards: boolean;
  enable_real_time_sessions: boolean;
  enable_ai_suggestions: boolean;
  enable_creator_fund: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enable_gamification: true,
  enable_daily_challenges: true,
  enable_leaderboards: true,
  enable_real_time_sessions: false,
  enable_ai_suggestions: false,
  enable_creator_fund: false,
};

export type ChallengeDifficulty = "beginner" | "intermediate" | "advanced" | "expert";
export type ChallengeType = "diagnostic_tree" | "causal_inference" | "logic_fallacy" | "brain_simulation";

export interface ChallengeScenarioOption {
  id: string;
  label: string;
  explanation: string;
  isCorrect: boolean;
}

export interface ChallengeScenario {
  id: string;
  prompt: string;
  options: ChallengeScenarioOption[];
}

export interface DailyChallenge {
  id: string;
  dateString: string; // "YYYY-MM-DD"
  title: string;
  description: string;
  category: string;
  communityId?: string;
  difficulty: ChallengeDifficulty;
  type: ChallengeType;
  associatedBrainId?: string;
  initialNodeId?: string;
  targetOutcomeNodeId?: string;
  scenarios: ChallengeScenario[];
  rewardXp: number;
  timeLimitSeconds?: number;
  createdAt: number;
}

export interface UserChallengeAttempt {
  id: string; // `${userId}_${challengeId}`
  userId: string;
  challengeId: string;
  dateString: string;
  answers: Record<string, string>; // scenarioId -> optionId
  isCompleted: boolean;
  isSuccessful: boolean;
  score: number; // percentage 0-100
  timeSpentSeconds: number;
  xpEarned: number;
  completedAt: number;
}

export type LeaderboardTimeframe = "daily" | "weekly" | "monthly" | "all_time";
export type LeaderboardMetric = "reasoning_xp" | "brains_built" | "answers_accepted" | "streak_days";

export interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  rank: number;
  score: number;
  badge?: string;
  change24h?: number;
}

export interface Leaderboard {
  id: string; // `${timeframe}_${metric}_${communityId || 'global'}`
  timeframe: LeaderboardTimeframe;
  metric: LeaderboardMetric;
  communityId?: string;
  updatedAt: number;
  entries: LeaderboardEntry[];
}

export type BadgeTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface AchievementBadge {
  id: string;
  code: string;
  name: string;
  description: string;
  tier: BadgeTier;
  iconName: string;
  xpValue: number;
  requirement: {
    type: "create_brain" | "solve_challenges" | "give_answers" | "streak_milestone";
    threshold: number;
  };
}

export interface UserAchievement {
  id: string;
  userId: string;
  badgeId: string;
  unlockedAt: number;
  isNotified: boolean;
}

export type SessionStatus = "waiting" | "active" | "concluded";

/**
 * The active media source the host is broadcasting. Only ONE source can
 * be active at a time — the user can't record their screen AND their
 * camera simultaneously (browser limitation + cognitive-load reason).
 * The host switches between these modes during the live session.
 *
 * `screen`        — host's own screen (getDisplayMedia).
 * `peer-screen`   — a peer's screen that the host is re-broadcasting
 *                   (for pair-debugging). The peer grants access first,
 *                   then the host re-streams it to the audience.
 * `voice`         — live voice/audio talking (getUserMedia audio only).
 * `cam`           — host's camera (getUserMedia video + audio).
 * `idle`          — no active media (paused between segments).
 */
export type LiveMediaMode = "screen" | "peer-screen" | "voice" | "cam" | "idle";

export interface RealtimeSessionParticipant {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  role: "host" | "contributor" | "spectator";
  joinedAt: number;
  currentNodeId?: string;
  /**
   * Whether the host has granted this participant microphone access.
   * Host is always true. Spectators default to false; the host can
   * promote them to "speaker" by flipping this flag. The participant's
   * audio is then mixed into the live stream.
   */
  canSpeak?: boolean;
  /**
   * Whether the participant is currently emitting audio (self-muted vs
   * unmuted). Distinct from canSpeak (permission) — a participant can
   * have permission but be muted.
   */
  isMuted?: boolean;
}

export interface RealtimeSession {
  id: string;
  title: string;
  brainId: string;
  hostUserId: string;
  communityId?: string;
  status: SessionStatus;
  participants: Record<string, RealtimeSessionParticipant>;
  activeNodeId: string;
  votingState?: {
    nodeId: string;
    options: Record<string, number>;
    voters: Record<string, string>;
  };
  createdAt: number;
  updatedAt: number;
  /**
   * Phase B-4: live media state. The host picks one mode at a time.
   * See LiveMediaMode for the rationale on single-source switching.
   */
  mediaMode?: LiveMediaMode;
  /**
   * Live chat messages — stored inline on the session for atomicity.
   * Each message is small (senderId + content + timestamp). In a real
   * deployment these would stream over WebSocket; here they persist
   * in IDB and participants see them on refresh.
   */
  chatMessages?: LiveChatMessage[];
  /**
   * The userId whose screen is being shared when mediaMode === "peer-screen".
   * Undefined for other modes.
   */
  peerScreenSharerId?: string;
}

export interface LiveChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: number;
  /**
   * System messages (join/leave/mic-grant) are styled differently from
   * user chat. They don't count toward rate limits.
   */
  isSystem?: boolean;
}
