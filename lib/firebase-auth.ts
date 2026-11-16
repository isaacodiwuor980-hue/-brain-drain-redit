import { getAuth, browserLocalPersistence, inMemoryPersistence, setPersistence } from "firebase/auth";
import { firebaseApp } from "./firebase-app";

export const auth = getAuth(firebaseApp);

/**
 * PREVIEW FIX (unhandled SecurityError page crash):
 *
 * Firebase Auth persists its token in IndexedDB (`firebaseLocalStorageDb`).
 * In storage-blocked contexts — the z.ai preview iframe (sandboxed /
 * third-party) and Safari ITP — Firebase's internal async DB open rejects
 * with an UNHANDLED SecurityError (it surfaces as a pageerror / unhandled
 * rejection even when our own code is fully guarded).
 *
 * Probe storage access ONCE at init (synchronously — Safari throws
 * synchronously on indexedDB access when blocked) and select the matching
 * persistence:
 *   - storage OK      → browserLocalPersistence (default behavior, survives reloads)
 *   - storage blocked → inMemoryPersistence (sign-in state lives for the
 *     session only; acceptable in preview/sandbox contexts, and guests —
 *     the primary preview flow — don't use Firebase at all)
 */
try {
  let storageUsable = false;
  try {
    // Access + open probe. Throws synchronously when storage is blocked
    // (Safari ITP, sandboxed iframe); succeeds (async) when partitioned.
    const probe = indexedDB.open("__bd_storage_probe");
    probe.onsuccess = () => {
      try { probe.result.close(); } catch { /* ignore */ }
      try { indexedDB.deleteDatabase("__bd_storage_probe"); } catch { /* ignore */ }
    };
    probe.onerror = () => { /* handled below via storageUsable flag */ };
    storageUsable = true;
  } catch {
    storageUsable = false;
  }

  void setPersistence(auth, storageUsable ? browserLocalPersistence : inMemoryPersistence)
    .catch(() => {
      // Last resort: if even the requested persistence fails to apply,
      // force in-memory so Firebase never touches IDB in this context.
      return setPersistence(auth, inMemoryPersistence);
    })
    .catch(() => { /* nothing more we can do; Firebase defaults apply */ });
} catch {
  // setPersistence itself threw synchronously — extremely unlikely; ignore
  // so the auth module still exports a usable `auth`.
}
