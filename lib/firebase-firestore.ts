import { getFirestore, initializeFirestore, memoryLocalCache } from "firebase/firestore";
import { firebaseApp, firebaseConfig } from "./firebase-app";

/**
 * Firestore instance for the Brain Drain app.
 *
 * CRITICAL: We initialize Firestore with MEMORY-ONLY persistence (no
 * IndexedDB cache). This is intentional because:
 *
 * 1. The app is migrating to Supabase (Phase 2+). Firestore is only used
 *    for personality tests and minor user data — IndexedDB persistence
 *    isn't worth the complexity.
 *
 * 2. We previously shipped the app with Firebase v10 (which used
 *    IndexedDB persistence with schema v10). The current Firebase v12
 *    uses schema v19. When a user with a v10 cache in their browser
 *    loads the v12 bundle, getFirestore() throws:
 *      "The requested version (10) is less than the existing version (19)"
 *    This crashed React's render and produced a blank home screen.
 *
 *    Memory-only mode bypasses IndexedDB entirely, so the version
 *    conflict can never happen. Existing v10 IndexedDB caches in users'
 *    browsers will eventually be garbage-collected by the browser
 *    (usually within 7 days of no use).
 *
 * 3. Firestore writes still work — they go to the server immediately.
 *    Only offline read caching is disabled, which is acceptable since
 *    the app's main data layer is now Supabase.
 *
 * Trade-off: Firestore reads will always hit the network. For the
 * personality test (1 small doc per user), this is fine. For any
 * future heavy Firestore usage, we'd revisit this.
 */

// initializeFirestore MUST be called exactly once per app instance.
// Use a flag to make this idempotent across HMR reloads.
let firestoreInitialized = false;

let dbInstance: ReturnType<typeof getFirestore> | null;

try {
  // initializeFirestore with memoryLocalCache — no IndexedDB persistence.
  // Falls back gracefully if the SDK API differs across versions.
  if (!firestoreInitialized) {
    try {
      // memoryLocalCache = memory-only mode (no IndexedDB persistence)
      dbInstance = initializeFirestore(firebaseApp, {
        localCache: memoryLocalCache(),
      }, firebaseConfig.firestoreDatabaseId);
      firestoreInitialized = true;
    } catch {
      // Fallback: plain getFirestore. This will still try IndexedDB
      // persistence by default, but if it throws the version-mismatch
      // error, the error is caught by the outer try/catch and we
      // surface it as a console warning instead of crashing React.
      dbInstance = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
      firestoreInitialized = true;
    }
  } else {
    dbInstance = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
  }
} catch (err) {
  // Last-resort fallback: log and continue. Firestore features won't
  // work but the rest of the app (Supabase-backed) will.
  console.warn("Firestore initialization failed — app will run without Firestore sync:", err);
  // Placeholder so imports don't crash. Callers must check for null.
  dbInstance = null;
}

export const db = dbInstance;
