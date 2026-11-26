/**
 * Offline Sync Engine.
 * Tracks user actions performed while disconnected, provides automatic reconciliation
 * when connectivity returns, and offers full transparency via UI status indicators.
 */

export interface QueuedAction {
  id: string;
  type: "create_post" | "post_reaction" | "add_comment" | "save_profile" | "update_mind";
  payload: Record<string, unknown>;
  createdAt: number;
  retryCount: number;
}

const STORAGE_KEY = "mindbuilder_offline_queue";

export function getOfflineQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: QueuedAction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    // Dispatch custom event so hooks in other components react immediately
    window.dispatchEvent(new CustomEvent("mindbuilder_queue_change", { detail: queue.length }));
  } catch {
    // Ignore storage quota errors
  }
}

export function queueOfflineAction(type: QueuedAction["type"], payload: Record<string, unknown>): void {
  const queue = getOfflineQueue();
  const newAction: QueuedAction = {
    id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
  };
  queue.push(newAction);
  saveOfflineQueue(queue);
}

export function clearOfflineQueue(): void {
  saveOfflineQueue([]);
}
