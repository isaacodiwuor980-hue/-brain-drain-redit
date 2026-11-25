/** Local-only state transition experiment. Not wired to IndexedDB or the API. */
export interface PendingBrainWrite {
  ownerId: string;
  brainId: string;
  operationId: string;
  expectedRevision: number;
  /** Local monotonic edit generation captured with the persisted payload. */
  editGeneration: number;
}
export interface BrainSyncState {
  ownerId: string;
  brainId: string;
  localGeneration: number;
  confirmedRevision: number;
  pending: PendingBrainWrite | null;
  status: "dirty" | "pending" | "synced" | "conflict";
}
export type SaveResult = { kind: "ok"; revision: number } | { kind: "conflict" } | { kind: "uncertain" };

/** Do not send pending work when the active account differs from its creator. */
export function maySendPending(state: BrainSyncState, activeOwner: string | null): boolean {
  const p = state.pending;
  return Boolean(p && state.status === "pending" && activeOwner && p.ownerId === activeOwner &&
    p.ownerId === state.ownerId && p.brainId === state.brainId && p.operationId &&
    Number.isSafeInteger(p.expectedRevision) && p.expectedRevision >= 0 && p.expectedRevision === state.confirmedRevision &&
    Number.isSafeInteger(p.editGeneration) && p.editGeneration >= 0 &&
    Number.isSafeInteger(state.localGeneration) && state.localGeneration >= p.editGeneration);
}

/** A late response must not clear newer edits, a different operation or account. */
export function applyBrainSaveResult(state: BrainSyncState, activeOwner: string | null, operationId: string, result: SaveResult): BrainSyncState {
  const p = state.pending;
  if (!p || !maySendPending(state, activeOwner) || p.operationId !== operationId) return state;
  if (result.kind === "uncertain") return state;
  if (result.kind === "conflict") return { ...state, status: "conflict" };
  if (!Number.isSafeInteger(result.revision) || result.revision !== p.expectedRevision + 1 || result.revision <= state.confirmedRevision) return state;
  return {
    ...state,
    confirmedRevision: result.revision,
    pending: null,
    status: state.localGeneration === p.editGeneration ? "synced" : "dirty",
  };
}
