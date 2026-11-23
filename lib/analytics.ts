import { idb } from "./db";
import { env } from "./env";
import { LOCAL_ANALYTICS_CHANGE, getLocalAnalyticsControl, getVisibleAnalyticsEvents, recordLocalAnalytics } from "./local-analytics-control";

// Global QueryClient reference — set by the React layer on app mount via
// setQueryClientRef(). This lets trackEvent() (a plain function, not a
// hook) invalidate the ["analytics_events"] query after each write so
// the feed stays fresh without the old 30s polling refetch.
type AnalyticsQueryClient = {
  invalidateQueries: (args: { queryKey: string[] }) => unknown;
  cancelQueries?: (args: { queryKey: string[] }) => unknown;
  setQueryData?: (key: string[], value: AnalyticsEvent[]) => unknown;
};
let queryClientRef: AnalyticsQueryClient | null = null;

export function setQueryClientRef(qc: AnalyticsQueryClient | null) {
  queryClientRef = qc;
}

export type AnalyticsEventType =
  | "session_start"
  | "session_end"
  | "app_visible"
  | "app_hidden"
  | "page_view"
  | "post_created"
  | "post_reaction"
  | "post_share"
  | "post_moderation_waiting"
  | "comment_created"
  | "comment_reaction"
  | "comment_classified"
  | "comment_pinned"
  | "comment_edited"
  | "comment_deleted"
  | "message_sent"
  | "search_submitted"
  | "search_recent_selected"
  | "topic_selected"
  | "feed_mode_selected"
  | "feed_sort_selected"
  | "notification_opened"
  | "mission_reminder"
  | "brain_launch"
  | "puzzle_score_copied"
  | "puzzle_score_shared"
  | "pathway_scenario_posted"
  | "pathway_milestone_completed"
  | "live_session_started"
  | "live_session_joined"
  | "live_session_mic_granted"
  | "reasoning_view_changed"
  | "brain_forked"
  | "brain_branch_proposed"
  | "brain_branch_merged"
  | "vote_reward";

export interface AnalyticsEvent {
  id: string;
  type: AnalyticsEventType;
  sessionId: string;
  createdAt: number;
  route: string;
  payload?: Record<string, unknown>;
}

const SESSION_KEY = "brain-builder-analytics-session";
const STORE = "analytics_events";
const MAX_BACKEND_BATCH_SIZE = 20;
const BACKEND_FLUSH_DELAY_MS = 1_500;
// Keep a soft cap on queued events so an offline session cannot grow without
// bound in memory.
const MAX_QUEUE_SIZE = 200;

type QueuedEvent = { event: AnalyticsEvent; epoch: number };
let backendQueue: QueuedEvent[] = [];
let activeRequest: AbortController | null = null;

function onPrivacyChange() {
  backendQueue = [];
  activeRequest?.abort();
  if (flushTimer !== null && typeof window !== "undefined") window.clearTimeout(flushTimer);
  flushTimer = null;
  // Remove cached signals immediately, then re-read under the new preference.
  void queryClientRef?.cancelQueries?.({ queryKey: ["analytics_events"] });
  queryClientRef?.setQueryData?.(["analytics_events"], []);
  void queryClientRef?.invalidateQueries({ queryKey: ["analytics_events"] });
}
if (typeof window !== "undefined") {
  window.addEventListener(LOCAL_ANALYTICS_CHANGE, onPrivacyChange);
  window.addEventListener("storage", event => { if (event.key === null || event.key === LOCAL_ANALYTICS_CHANGE) onPrivacyChange(); });
}
let flushTimer: number | null = null;
let isFlushing = false;

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getAnalyticsSessionId() {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = createId();
    sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return "session-unavailable";
  }
}

function sanitizePayload(payload?: Record<string, unknown>) {
  if (!payload) return undefined;

  return Object.fromEntries(
    Object.entries(payload)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === "string") {
          return [key, value.slice(0, 160)];
        }
        return [key, value];
      }),
  );
}

function getEventsEndpoint() {
  return `${env.apiBaseUrl}/api/events`;
}

/** Events are only sent to the backend when analytics is enabled. */
function isAnalyticsEnabled(): boolean {
  return env.features.analytics;
}

function scheduleBackendFlush() {
  if (typeof window === "undefined" || flushTimer) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushAnalyticsEvents();
  }, BACKEND_FLUSH_DELAY_MS);
}

function sanitizePayloadForBackend(payload?: Record<string, unknown>) {
  if (!payload) return undefined;

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    const lowerKey = key.toLowerCase();
    // Browser query strings and referrers can contain search terms, tokens or
    // personal data. They remain local for legacy recommendations but are not
    // included in the outbound activity payload.
    if (lowerKey === "query") {
      if (typeof value === "string") sanitized.queryLength = value.length;
      continue;
    }
    if (lowerKey === "search" || lowerKey === "referrer") continue;
    if (lowerKey === "path" && typeof value === "string") {
      sanitized[key] = value.split(/[?#]/, 1)[0].slice(0, 80);
      continue;
    }

    if (typeof value === "string") sanitized[key] = value.slice(0, 80);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) sanitized[key] = value;
    else if (Array.isArray(value)) sanitized[key] = value.slice(0, 10);
    else sanitized[key] = "[redacted]";
  }

  return sanitized;
}

function requeueBatch(batch: QueuedEvent[]) {
  // Put failed events back at the front of the queue for a later retry,
  // but cap total memory usage.
  backendQueue = [...batch, ...backendQueue].slice(0, MAX_QUEUE_SIZE);
}

function queueBackendEvent(event: AnalyticsEvent, epoch: number) {
  if (!isAnalyticsEnabled()) return;

  const backendEvent: AnalyticsEvent = {
    ...event,
    route: typeof window !== "undefined" ? window.location.pathname : event.route.split("?")[0],
    payload: sanitizePayloadForBackend(event.payload),
  };

  backendQueue.push({ event: backendEvent, epoch });
  if (backendQueue.length > MAX_QUEUE_SIZE) {
    backendQueue = backendQueue.slice(-MAX_QUEUE_SIZE);
  }

  if (backendQueue.length >= MAX_BACKEND_BATCH_SIZE) {
    void flushAnalyticsEvents();
  } else {
    scheduleBackendFlush();
  }
}

export async function flushAnalyticsEvents() {
  if (typeof window === "undefined" || isFlushing || backendQueue.length === 0) return;
  if (!isAnalyticsEnabled()) return;

  isFlushing = true;
  let batch = backendQueue.splice(0, MAX_BACKEND_BATCH_SIZE);
  const controller = new AbortController();
  activeRequest = controller;
  try {
    // If preference storage is unavailable, discard pending events rather than
    // retrying them against a later, possibly reset, browser database.
    let control: Awaited<ReturnType<typeof getLocalAnalyticsControl>>;
    try { control = await getLocalAnalyticsControl(); }
    catch { backendQueue = []; return; }
    if (controller.signal.aborted || !control.enabled) return;
    batch = batch.filter(item => item.epoch === control.epoch);
    if (batch.length === 0) return;
    const response = await fetch(getEventsEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch.map(item => item.event), clientSentAt: Date.now() }),
      signal: controller.signal,
      keepalive: true,
    });

    // Static previews can return the SPA HTML with a 200 instead of an API
    // response. Treat that as unavailable and retry later.
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("application/json")) {
      return;
    }

    // 4xx other than 429 means the payload was rejected; do not retry it
    // (it would loop forever). 5xx/429/network errors are retried.
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      if (env.isDev && response.status !== 404) {
        console.warn("Analytics events rejected", response.status);
      }
      return;
    }
    if (!controller.signal.aborted) requeueBatch(batch);
  } catch {
    // A privacy change discards the batch; storage/network errors never break UX.
    if (!controller.signal.aborted) requeueBatch(batch);
  } finally {
    if (activeRequest === controller) activeRequest = null;
    isFlushing = false;
    if (backendQueue.length > 0) scheduleBackendFlush();
  }
}

// sendBeacon cannot check current IndexedDB consent or be cancelled. Use the
// asynchronous flush instead; page-close delivery becomes best-effort.
export function flushAnalyticsEventsWithBeacon() { return false; }

export async function trackEvent(type: AnalyticsEventType, payload?: Record<string, unknown>) {
  const event: AnalyticsEvent = {
    id: createId(),
    type,
    sessionId: getAnalyticsSessionId(),
    createdAt: Date.now(),
    route: typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "unknown",
    payload: sanitizePayload(payload),
  };

  let epoch: number | null;
  try {
    epoch = await recordLocalAnalytics(event);
  } catch {
    // If the local preference cannot be checked, do not collect or transmit.
    return;
  }
  if (epoch === null) return;
  queueBackendEvent(event, epoch);

  // PERF: prune old events on every write to prevent unbounded growth.
  // Without this, the analytics_events store grows forever and
  // getAnalyticsEvents() + buildTopicScores() become O(n) on every feed
  // recompute. We keep the most recent 500 events (covers ~1 week of
  // active use) and delete the rest. The prune is fire-and-forget — it
  // runs asynchronously and never blocks the calling action.
  void pruneOldEvents();

  // Invalidate the React Query cache so the feed picks up the new event
  // without needing the old 30s polling refetch. This is debounced by
  // TanStack's built-in batching — multiple trackEvent calls in the same
  // tick collapse into one refetch.
  if (queryClientRef) {
    try {
      queryClientRef.invalidateQueries({ queryKey: ["analytics_events"] });
    } catch {
      // best-effort
    }
  }
}

/**
 * Max analytics events to keep in IDB. Older events are pruned on every
 * write. 500 is enough for ~1 week of active use (the feed ranking only
 * needs recent signals); older events have decayed to near-zero weight
 * anyway via the ageDecay() function in recommendations.ts.
 */
export const MAX_ANALYTICS_EVENTS = 500;

/**
 * Prunes old analytics events to prevent unbounded IDB growth.
 * Keeps the most recent MAX_ANALYTICS_EVENTS events, deletes the rest.
 * Fire-and-forget — called on every trackEvent but never awaited.
 */
export async function pruneOldEvents(): Promise<void> {
  try {
    const all = await idb.getAll<AnalyticsEvent>(STORE);
    if (all.length <= MAX_ANALYTICS_EVENTS) return;
    // Sort by createdAt descending, keep the newest MAX, delete the rest.
    all.sort((a, b) => b.createdAt - a.createdAt);
    const toDelete = all.slice(MAX_ANALYTICS_EVENTS);
    await idb.deleteAll(STORE, toDelete.map((e) => e.id));
  } catch {
    // Pruning is best-effort — never break the product experience.
  }
}

/**
 * Returns recent analytics events, capped to the last MAX_ANALYTICS_EVENTS
 * by createdAt. This is the performance-safe replacement for the old
 * getAnalyticsEvents() which loaded ALL events (including ancient ones
 * that had decayed to near-zero weight but still cost O(n) to iterate).
 */
export async function getAnalyticsEvents(): Promise<AnalyticsEvent[]> {
  let all: AnalyticsEvent[];
  try { all = await getVisibleAnalyticsEvents<AnalyticsEvent>(); } catch { return []; }
  // Sort newest-first and cap — this bounds the work buildTopicScores
  // has to do, regardless of how many events accumulated before the
  // prune ran.
  all.sort((a, b) => b.createdAt - a.createdAt);
  return all.slice(0, MAX_ANALYTICS_EVENTS);
}
