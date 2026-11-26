import { applyBrainSaveResult, maySendPending, type BrainSyncState, type SaveResult } from "./brain-sync-state";

// Unwired experiment: separate database so existing unscoped records are never
// silently claimed by whichever account happens to be signed in. The caller
// must bind ownerId to the current verified session; this is not authorization.
export interface LocalSyncDocument {
  ownerId: string;
  brainId: string;
  snapshot: Record<string, unknown>;
  sync: BrainSyncState;
  pendingSnapshot: Record<string, unknown> | null;
}
const DB_NAME = "brainBuilderSyncExperiment";
export function openBrainSyncExperiment(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("documents", {keyPath:["ownerId","brainId"]});
    request.onerror = () => reject(request.error ?? new Error("Sync storage unavailable"));
    request.onblocked = () => { blocked = true; reject(new Error("Sync storage upgrade blocked")); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close(); resolve(request.result);
    };
  });
}
function validKey(value: string): boolean { return /^[A-Za-z0-9_-]{1,128}$/.test(value); }
function validOperation(value: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
function checked(doc: LocalSyncDocument, ownerId: string, brainId: string): void {
  if (doc.ownerId !== ownerId || doc.brainId !== brainId || doc.sync.ownerId !== ownerId || doc.sync.brainId !== brainId ||
      !Number.isSafeInteger(doc.sync.localGeneration) || doc.sync.localGeneration < 0 ||
      !Number.isSafeInteger(doc.sync.confirmedRevision) || doc.sync.confirmedRevision < 0 ||
      (doc.sync.pending === null) !== (doc.pendingSnapshot === null)) throw new Error("Invalid local sync record");
}
/** A read/write transaction serializes competing tabs for each document. */
async function change(db: IDBDatabase, ownerId: string, brainId: string, fn: (doc: LocalSyncDocument | undefined) => LocalSyncDocument): Promise<LocalSyncDocument> {
  if (!validKey(ownerId) || !validKey(brainId) || brainId.length > 120) throw new Error("Invalid sync identity");
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite"), store = tx.objectStore("documents");
    let result: LocalSyncDocument | undefined, failure: unknown;
    tx.oncomplete = () => result ? resolve(result) : reject(new Error("Sync update missing"));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error("Sync update aborted"));
    tx.onerror = () => reject(failure ?? tx.error ?? new Error("Sync update failed"));
    const get = store.get([ownerId,brainId]);
    get.onsuccess = () => {
      try {
        const old = get.result as LocalSyncDocument | undefined;
        if (old) checked(old,ownerId,brainId);
        result = fn(old);
        checked(result,ownerId,brainId);
        store.put(result);
      } catch (error) { failure = error; tx.abort(); }
    };
  });
}
export async function saveLocalSyncEdit(db: IDBDatabase, ownerId: string, brainId: string, snapshot: Record<string,unknown>) {
  if (snapshot.id !== brainId) throw new Error("Snapshot identifier mismatch");
  return change(db,ownerId,brainId,old => {
    const previous = old?.sync ?? {ownerId,brainId,localGeneration:0,confirmedRevision:0,pending:null,status:"dirty" as const};
    if (previous.localGeneration >= Number.MAX_SAFE_INTEGER) throw new Error("Local generation exhausted");
    return {ownerId,brainId,snapshot,sync:{...previous,localGeneration:previous.localGeneration+1,status:previous.pending ? previous.status : "dirty"},pendingSnapshot:old?.pendingSnapshot ?? null};
  });
}
export async function stageLocalSyncWrite(db: IDBDatabase, ownerId: string, brainId: string, operationId: string) {
  if (!validOperation(operationId)) throw new Error("Invalid operation ID");
  return change(db,ownerId,brainId,old => {
    if (!old || old.sync.status !== "dirty" || old.sync.pending) throw new Error("No unsent local edit");
    return {...old,pendingSnapshot:old.snapshot,sync:{...old.sync,status:"pending",pending:{ownerId,brainId,operationId,expectedRevision:old.sync.confirmedRevision,editGeneration:old.sync.localGeneration}}};
  });
}
export async function acknowledgeLocalSyncWrite(db: IDBDatabase, ownerId: string, brainId: string, activeOwner: string | null, operationId: string, result: SaveResult) {
  return change(db,ownerId,brainId,old => {
    if (!old || !maySendPending(old.sync,activeOwner) || old.sync.pending?.operationId !== operationId) throw new Error("Sync operation no longer current");
    const sync=applyBrainSaveResult(old.sync,activeOwner,operationId,result);
    return {...old,sync,pendingSnapshot:sync.pending ? old.pendingSnapshot : null};
  });
}
export async function readLocalSyncDocument(db: IDBDatabase, ownerId: string, brainId: string): Promise<LocalSyncDocument | null> {
  if (!validKey(ownerId) || !validKey(brainId) || brainId.length > 120) throw new Error("Invalid sync identity");
  return new Promise((resolve,reject) => {
    const tx=db.transaction('documents','readonly'), request=tx.objectStore('documents').get([ownerId,brainId]);
    request.onsuccess=()=>{try{const value=request.result as LocalSyncDocument | undefined;if(value)checked(value,ownerId,brainId);resolve(value??null);}catch(error){reject(error);}};
    request.onerror=()=>reject(request.error ?? new Error("Sync read failed"));
    tx.onabort=()=>reject(tx.error ?? new Error("Sync read aborted"));
  });
}
