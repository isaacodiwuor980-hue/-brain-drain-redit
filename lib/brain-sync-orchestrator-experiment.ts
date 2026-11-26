import { acknowledgeLocalSyncWrite, readLocalSyncDocument } from "./brain-sync-local-experiment";
import { maySendPending, type SaveResult } from "./brain-sync-state";

/** Still unwired. The provider must bind token and uid to the same authenticated
 * user and return a generation that changes on each sign-out/sign-in, even for
 * the same UID. Token refresh alone should not change the generation. */
export interface SyncSession { uid: string; token: string | null; sessionGeneration: number }
function validSession(session: SyncSession | null, ownerId: string): session is SyncSession {
  return !!session && session.uid === ownerId && typeof session.token === "string" && session.token.length > 0 &&
    Number.isSafeInteger(session.sessionGeneration) && session.sessionGeneration >= 0;
}
export interface BrainSyncRequest {
  brainId: string;
  operationId: string;
  expectedRevision: number;
  snapshot: Record<string, unknown>;
}
export type BrainSyncTransport = (request: BrainSyncRequest, token: string) => Promise<SaveResult>;
export type SyncAttempt = "acknowledged" | "conflict" | "unconfirmed" | "not-sent" | "session-changed";

/** One explicitly invoked attempt. No scheduler or automatic retries. */
export async function sendPendingBrainExperiment(
  db: IDBDatabase,
  ownerId: string,
  brainId: string,
  getSession: () => Promise<SyncSession | null>,
  send: BrainSyncTransport,
): Promise<SyncAttempt> {
  const before = await getSession().catch(() => null);
  if (!validSession(before, ownerId)) return "not-sent";
  const doc = await readLocalSyncDocument(db, ownerId, brainId);
  const pending = doc?.sync.pending;
  if (!doc || !pending || !doc.pendingSnapshot || !maySendPending(doc.sync, before.uid)) return "not-sent";
  // Capture and recheck immediately before sending. The token remains tied to
  // the original user even if a switch happens after this check.
  const current = await getSession().catch(() => null);
  if (!validSession(current, ownerId)) return "not-sent";
  if (current.sessionGeneration !== before.sessionGeneration) return "session-changed";
  let result: SaveResult;
  try {
    result = await send({brainId,operationId:pending.operationId,expectedRevision:pending.expectedRevision,snapshot:doc.pendingSnapshot}, current.token);
  } catch { result = {kind:"uncertain"}; }
  const after = await getSession().catch(() => null);
  if (!validSession(after, ownerId) || after.sessionGeneration !== before.sessionGeneration) return "session-changed";
  if (!result || (result.kind !== "ok" && result.kind !== "conflict")) return "unconfirmed";
  const updated = await acknowledgeLocalSyncWrite(db, ownerId, brainId, after.uid, pending.operationId, result);
  if (result.kind === "conflict") return "conflict";
  // Invalid acknowledgements leave the operation intact; never report success.
  return updated.sync.pending === null ? "acknowledged" : "unconfirmed";
}
