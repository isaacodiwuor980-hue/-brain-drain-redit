/**
 * lib/api/community.ts — API client functions for the community rebuild
 * feature (Task A P3): OTP auth, onboarding, personality, experts, mentors,
 * recall. Wraps lib/api-client.ts.
 */
import { api, type RequestOptions } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";

/**
 * ROOT-CAUSE FIX (B1): every community endpoint is `requireAuth` server-side
 * (onboarding.ts, personality.ts, experts.ts, mentors.ts, recall.ts), but this
 * module previously sent no Authorization header — so EVERY call, including
 * from fully signed-in users, returned 401 and dead-ended onboarding with
 * "Please sign in to continue."
 *
 * The token is attached per-module (not globally in api-client) so guest
 * traffic never loads the firebase-auth chunk: getAuthToken() resolves to
 * null for guests, and the heavy SDK import only happens inside the
 * signed-in flows that actually need it.
 */
async function withAuth(options?: RequestOptions): Promise<RequestOptions> {
  const token = await getAuthToken();
  if (!token) return options ?? {};
  return {
    ...options,
    headers: { ...(options?.headers ?? {}), Authorization: `Bearer ${token}` },
  };
}

/** `api`, but every request carries the signed-in user's Firebase token. */
const authedApi = {
  get: <T>(path: string, options?: RequestOptions) =>
    withAuth(options).then((o) => api.get<T>(path, o)),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    withAuth(options).then((o) => api.post<T>(path, body, o)),
  request: <T>(path: string, options?: RequestOptions) =>
    withAuth(options).then((o) => api.request<T>(path, o)),
};

// ===========================================================================
// Onboarding
// ===========================================================================

export type OnboardingStep = "profile" | "interests" | "personality" | "experts" | "done";

export interface OnboardingState {
  currentStep: OnboardingStep;
  profileCompletedAt: string | null;
  interestsCompletedAt: string | null;
  personalityCompletedAt: string | null;
  expertsCompletedAt: string | null;
  completedAt: string | null;
  scratch: Record<string, unknown>;
}

export const onboardingApi = {
  get: () => api.get<OnboardingState>("/api/onboarding"),

  start: () =>
    authedApi.post<{ ok: boolean; currentStep: OnboardingStep; existed: boolean }>("/api/onboarding/start"),

  advance: (step: OnboardingStep, scratch?: Record<string, unknown>) =>
    authedApi.request<{ ok: boolean; currentStep: OnboardingStep }>(
      `/api/onboarding/step/${step}`,
      { method: "PATCH", json: scratch ? { scratch } : {} },
    ),
};

// ===========================================================================
// Personality (BFI-10)
// ===========================================================================

export interface Bfi10Responses {
  e1: number; e2r: number;
  a1: number; a2r: number;
  c1: number; c2r: number;
  n1: number; n2r: number;
  o1: number; o2r: number;
}

export interface PersonalityScores {
  extraversion: string;
  agreeableness: string;
  conscientiousness: string;
  neuroticism: string;
  openness: string;
}

export interface PersonalityResult {
  id: string;
  extraversion: number;
  agreeableness: number;
  conscientiousness: number;
  neuroticism: number;
  openness: number;
  testVersion: string;
  createdAt: string;
}

export const personalityApi = {
  submit: (responses: Bfi10Responses) =>
    authedApi.post<{ ok: boolean; scores: PersonalityScores; testVersion: string }>(
      "/api/personality/submit",
      { responses },
    ),

  get: () => api.get<PersonalityResult | null>("/api/personality"),
};

// ===========================================================================
// Experts
// ===========================================================================

export type ExpertCredentialStatus = "draft" | "pending_review" | "verified" | "rejected";

export interface ExpertApplicationInput {
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  expertise: string;
  expertiseTags?: string[];
  credentials: {
    orcid?: string;
    licenseState?: string;
    licenseNumber?: string;
    institution?: string;
    title?: string;
  };
}

export interface ExpertPublic {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  expertise: string;
  expertiseTags: string[];
  verifiedAt: string | null;
  createdAt: string;
}

export interface ExpertSelf extends ExpertPublic {
  credentialStatus: ExpertCredentialStatus;
  credentials: Record<string, unknown>;
  isPublic: boolean;
  reviewedAt: string | null;
  reviewNotes: string | null;
  updatedAt: string;
}

export const expertsApi = {
  submit: (input: ExpertApplicationInput) =>
    authedApi.post<{ ok: boolean; status: "draft" }>("/api/experts", input),

  list: (expertise?: string) =>
    authedApi.get<{ experts: ExpertPublic[] }>(
      `/api/experts${expertise ? `?expertise=${encodeURIComponent(expertise)}` : ""}`,
    ),

  me: () => api.get<ExpertSelf | null>("/api/experts/me"),

  submitForReview: (id: string) =>
    authedApi.post<{ ok: boolean; status: "pending_review" }>(`/api/experts/${id}/submit`),

  adminReview: (id: string, decision: "verified" | "rejected", notes?: string) =>
    authedApi.post<{ ok: boolean; status: "verified" | "rejected" }>(
      `/api/experts/${id}/verify`,
      { decision, notes },
    ),
};

// ===========================================================================
// Mentors
// ===========================================================================

export type MentorshipStatus =
  | "requested" | "accepted" | "active" | "completed" | "declined" | "cancelled";

export interface Mentorship {
  id: string;
  expertId: string;
  mentorUserId: string;
  menteeUserId: string;
  topicId: string | null;
  status: MentorshipStatus;
  goal: string | null;
  startedAt: string | null;
  endsAt: string | null;
  completedAt: string | null;
  completionNotes: string | null;
  createdAt: string;
}

export interface MentorshipRequestInput {
  expertId: string;
  topicId?: string;
  goal?: string;
  endsAt?: string;
}

export const mentorsApi = {
  request: (input: MentorshipRequestInput) =>
    authedApi.post<{ ok: boolean; status: "requested" }>("/api/mentors", input),

  myMentee: () =>
    authedApi.get<{ mentorships: Mentorship[] }>("/api/mentors/me/mentee"),

  myMentor: () =>
    authedApi.get<{ mentorships: Mentorship[] }>("/api/mentors/me/mentor"),

  accept: (id: string) =>
    authedApi.post<{ ok: boolean; status: "accepted" }>(`/api/mentors/${id}/accept`),

  start: (id: string) =>
    authedApi.post<{ ok: boolean; status: "active" }>(`/api/mentors/${id}/start`),

  complete: (id: string, notes?: string) =>
    authedApi.post<{ ok: boolean; status: "completed" }>(`/api/mentors/${id}/complete`, { notes }),

  decline: (id: string) =>
    authedApi.post<{ ok: boolean; status: "declined" }>(`/api/mentors/${id}/decline`),

  cancel: (id: string) =>
    authedApi.post<{ ok: boolean; status: "cancelled" }>(`/api/mentors/${id}/cancel`),
};

// ===========================================================================
// Recall (SM-2)
// ===========================================================================

export interface Sm2State {
  repetition: number;
  intervalDays: number;
  easeFactor: number;
}

export interface RecallEventInput {
  mindId?: string;
  topicId?: string;
  quality: number; // 0-5
  sm2StateBefore?: Partial<Sm2State>;
}

export interface RecallRecordResponse {
  ok: boolean;
  sm2State: Sm2State;
  nextRecallAt: string;
}

export interface RecallDueItem {
  id: string;
  mindId: string | null;
  topicId: string | null;
  nextRecallAt: string;
}

export interface RecallHistoryItem {
  id: string;
  mindId: string | null;
  topicId: string | null;
  quality: number;
  sm2State: Sm2State;
  nextRecallAt: string;
  recalledAt: string;
}

export const recallApi = {
  record: (input: RecallEventInput) =>
    authedApi.post<RecallRecordResponse>("/api/recall", input),

  due: (limit = 20) =>
    authedApi.get<{ due: RecallDueItem[] }>(`/api/recall/due?limit=${limit}`),

  history: (limit = 50) =>
    authedApi.get<{ history: RecallHistoryItem[] }>(`/api/recall/history?limit=${limit}`),
};
