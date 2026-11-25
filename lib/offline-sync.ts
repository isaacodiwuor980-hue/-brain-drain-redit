/**
 * Offline Sync Engine.
 *
 * Tracks user actions performed while disconnected, provides automatic
 * reconciliation when connectivity returns, and offers full transparency via
 * UI status indicators.
 *
 * HARDENED (Phase 2, harsh-condition resilience):
 *  - Every queued action carries `retryCount` + `nextAttemptAt`, so backoff
 *    SURVIVES a reload instead of restarting from zero.
 *  - Backoff is exponential WITH JITTER (see lib/api-client.ts
 *    computeBackoffMs). A fleet of clients coming back online after an
 *    outage no longer stampedes the API in lockstep.
 *  - Held posts, brain versions and reaction toggles are retained individually
 *    for review; they are not automatically replayed or coalesced.
 *  - A poison action can no longer block the queue forever: after
 *    MAX_RETRIES it is quarantined (kept in `deadLetter` for inspection)
 *    rather than silently dropped.
 *  - Unreadable queue data is preserved; writes fail closed for recovery.
 */

export interface QueuedAction {
  id: string;
  type: "create_post" | "post_reaction" | "add_comment" | "save_profile" | "update_brain";
  payload: Record<string, unknown>;
  /** Firebase user that created the action. Legacy unscoped entries must not replay automatically. */
  ownerId?: string;
  createdAt: number;
  retryCount: number;
  /** Epoch ms before which this action must not be replayed (backoff). */
  nextAttemptAt?: number;
}

const STORAGE_KEY = "brainbuilder_offline_queue";
const DEAD_LETTER_KEY = "brainbuilder_offline_queue_dead";
/** Retries before an action is quarantined instead of retried forever. */
export const MAX_RETRIES = 5;

/** Null means unreadable or malformed, never an empty confirmed queue. */
function readQueueStrict(key: string): QueuedAction[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const ids = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const a = item as Partial<QueuedAction>;
      if (typeof a.id !== "string" || !a.id || ids.has(a.id) ||
          typeof a.type !== "string" || typeof a.createdAt !== "number" ||
          typeof a.retryCount !== "number" || a.payload === null ||
          typeof a.payload !== "object" || Array.isArray(a.payload)) return null;
      ids.add(a.id);
    }
    return parsed as QueuedAction[];
  } catch { return null; }
}

export function getOfflineQueueStrict(): QueuedAction[] | null {
  return readQueueStrict(STORAGE_KEY);
}

/** For display only: a failure is not evidence that storage is empty. */
export function getOfflineQueue(): QueuedAction[] {
  return getOfflineQueueStrict() ?? [];
}

/** Null means recovery data could not be read safely. */
export function getDeadLetterQueueStrict(): QueuedAction[] | null {
  return readQueueStrict(DEAD_LETTER_KEY);
}

/** Quarantined actions — display only, never replayed. */
export function getDeadLetterQueue(): QueuedAction[] {
  return getDeadLetterQueueStrict() ?? [];
}

function writeQueue(key: string, queue: QueuedAction[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(queue));
    try { window.dispatchEvent(new CustomEvent("brainbuilder_queue_change", { detail: queue.length })); } catch { /* persisted already */ }
    return true;
  } catch { return false; }
}

export function saveOfflineQueue(queue: QueuedAction[]): boolean {
  // Do not replace damaged or unreadable storage with a partial/empty view.
  if (getOfflineQueueStrict() === null) return false;
  return writeQueue(STORAGE_KEY, queue);
}

export function clearOfflineQueue(): void {
  writeQueue(STORAGE_KEY, []);
}

/**
 * Identity of an action for coalescing purposes. Two actions with the same
 * key are interchangeable — only the newest needs replaying.
 */
export function actionKey(action: Pick<QueuedAction, "type" | "payload" | "ownerId">): string {
  const owner = JSON.stringify([action.ownerId ?? null]);
  switch (action.type) {
    case "create_post":
      return `${owner}:create_post:${String(action.payload?.postId ?? "")}`;
    case "post_reaction":
      return `${owner}:post_reaction:${String(action.payload?.postId ?? "")}`;
    case "update_brain":
      return `${owner}:update_brain:${String((action.payload?.brain as { id?: string } | undefined)?.id ?? "")}`;
    default:
      return `${owner}:${action.type}:${JSON.stringify(action.payload ?? {})}`;
  }
}

/**
 * Append an action. Never coalesce held actions: an earlier toggle may have
 * committed and a brain update may be a conflicting version. Other legacy
 * action types retain their existing coalescing behavior.
 */
export function enqueueAction(
  queue: QueuedAction[],
  action: Omit<QueuedAction, "id" | "createdAt" | "retryCount">,
): QueuedAction[] {
  const key = actionKey(action);
  const held = requiresManualSyncReview(action);
  const filtered = held ? queue : queue.filter((existing) => actionKey(existing) !== key);
  const baseId = `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const existingIds = new Set(queue.map(item => item.id));
  let id = baseId;
  for (let suffix = 1; existingIds.has(id); suffix++) id = `${baseId}_${suffix}`;
  const next: QueuedAction = {
    ...action,
    id,
    createdAt: Date.now(),
    retryCount: 0,
  };
  return [...filtered, next];
}

/** Reconcile a completed batch against the latest queue, preserving actions
 * added or replaced while requests were in flight. A coalesced newer action
 * has a new id and must never be replaced by a retry of the older one. */
export function reconcileSyncBatch(
  latest: QueuedAction[],
  completedIds: string[],
  retries: QueuedAction[],
  deadIds: string[],
): QueuedAction[] {
  const removed = new Set([...completedIds, ...deadIds]);
  const retryById = new Map(retries.map((action) => [action.id, action]));
  return latest.filter((action) => !removed.has(action.id)).map((action) => retryById.get(action.id) ?? action);
}

export function queueOfflineAction(
  type: QueuedAction["type"],
  payload: Record<string, unknown>,
  ownerId?: string,
): boolean {
  const current = getOfflineQueueStrict();
  if (current === null) return false;
  const queue = enqueueAction(current, { type, payload, ownerId });
  return saveOfflineQueue(queue);
}

/** Posts lack a trusted retry permit/review flow, brain edits lack versioned
 * conflict handling, and toggles can reverse an already-applied reaction.
 * Keep these actions for review; this is not a complete recovery interface. */
export function requiresManualSyncReview(action: Pick<QueuedAction, "type">): boolean {
  // Persisted queues may contain newer or malformed action types despite the
  // TypeScript union. Only explicitly known local-only cases may be skipped.
  return action.type !== "add_comment" && action.type !== "save_profile";
}

/** Unowned legacy entries and other accounts' work must never be replayed. */
export function actionsForOwner(queue: QueuedAction[], ownerId: string | null | undefined): QueuedAction[] {
  return ownerId ? queue.filter((action) => action.ownerId === ownerId) : [];
}

/** Status only; unknown-owner entries remain untouched and are not attributed. */
export function summarizeOwnedQueue(pending: QueuedAction[], dead: QueuedAction[], ownerId: string | null | undefined): {pending:number;attention:number} {
  const owned=actionsForOwner(pending,ownerId);
  return {pending:owned.length,attention:owned.filter(action=>action.nextAttemptAt===Number.MAX_SAFE_INTEGER).length+actionsForOwner(dead,ownerId).length};
}

/**
 * Split the queue into the actions that may run now and the ones still
 * waiting out their backoff. Pure — unit-tested.
 */
export function partitionDueActions(
  queue: QueuedAction[],
  now: number = Date.now(),
): { due: QueuedAction[]; waiting: QueuedAction[] } {
  const due: QueuedAction[] = [];
  const waiting: QueuedAction[] = [];
  for (const action of queue) {
    if (!action.nextAttemptAt || action.nextAttemptAt <= now) due.push(action);
    else waiting.push(action);
  }
  return { due, waiting };
}

/**
 * Record a failed attempt: bump the counter, schedule the next try with
 * jitter, and quarantine the action if it has exhausted its budget.
 */
export function recordFailure(
  action: QueuedAction,
  now: number = Date.now(),
): { retry: QueuedAction | null; dead: QueuedAction | null } {
  const retryCount = action.retryCount + 1;
  if (retryCount >= MAX_RETRIES) {
    return { retry: null, dead: { ...action, retryCount } };
  }
  // Inline jittered exponential backoff (kept dependency-free so this module
  // stays usable from non-browser contexts, e.g. the replay tests).
  const cap = Math.min(60_000, 500 * 2 ** retryCount);
  const nextAttemptAt = now + Math.round(Math.random() * cap);
  return { retry: { ...action, retryCount, nextAttemptAt }, dead: null };
}

/** Persist without evicting earlier work; callers must retain failures if this fails. */
export function quarantineActions(actions: QueuedAction[]): boolean {
  if (actions.length === 0) return true;
  try {
    const existing = getDeadLetterQueueStrict();
    if (existing === null) return false;
    const byId = new Map(existing.map(item => [item.id, item]));
    for (const action of actions) {
      const prior = byId.get(action.id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(action)) return false;
      byId.set(action.id, action);
    }
    const combined = [...byId.values()];
    if (combined.length > 50) return false;
    localStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(combined));
    try { window.dispatchEvent(new CustomEvent("brainbuilder_queue_change", {detail:combined.length})); } catch { /* storage write already succeeded */ }
    return true;
  } catch { return false; }
}

/** Preserve work in the pending queue if quarantine cannot be persisted. */
export function quarantineOutcome(actions: QueuedAction[], persisted: boolean): {deadIds:string[]; held:QueuedAction[]} {
  return persisted
    ? {deadIds:actions.map(action => action.id),held:[]}
    : {deadIds:[],held:actions.map(action => ({...action,nextAttemptAt:Number.MAX_SAFE_INTEGER}))};
}

export function clearDeadLetterQueue(): void {
  writeQueue(DEAD_LETTER_KEY, []);
}
