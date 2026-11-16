import { idb } from "@/lib/db";

// A minimal user shape shared by real Firebase users and local guest users.
export interface AppUser {
  id: string;
  uid: string;
  displayName: string | null;
  username?: string;
  email: string | null;
  photoURL: string | null;
  avatarUrl?: string;
}

export const isGuestUser = (user: AppUser | null): boolean =>
  !!user && user.uid.startsWith("guest-");

/**
 * Legacy fallback user ID — used when no user is signed in (e.g. during
 * SSR, in non-React code, or when the AuthProvider hasn't loaded yet).
 *
 * All new code should use useAuth().user?.uid instead. This constant
 * exists so legacy code that hasn't been migrated yet continues to work.
 */
export const LEGACY_USER_ID = "me";
export const LEGACY_USER_DISPLAY_NAME = "Me";

/**
 * Returns the user ID for the given AppUser, or LEGACY_USER_ID if null.
 * Use this in hooks/components that need a stable string ID but can
 * tolerate the legacy "me" fallback for guest/not-yet-loaded state.
 */
export function userIdOr(user: AppUser | null, fallback: string = LEGACY_USER_ID): string {
  return user?.uid ?? fallback;
}

/**
 * Returns the display name for the given AppUser, or LEGACY_USER_DISPLAY_NAME
 * if null/empty. Use this when rendering author names on posts/comments/etc.
 */
export function displayNameOr(user: AppUser | null, fallback: string = LEGACY_USER_DISPLAY_NAME): string {
  if (!user) return fallback;
  return user.displayName?.trim() || user.email?.split("@")[0] || fallback;
}

export interface PersonalityTestData {
  answers: Record<string, number>;
  isCompleted: boolean;
  updatedAt: number;
}

const PT_SETTINGS_ID = "personality-test";

function loadFirestoreServices() {
  return Promise.all([
    import("@/lib/firebase-firestore"),
    import("firebase/firestore"),
  ]).then(([firebase, firestore]) => ({
    db: firebase.db,
    doc: firestore.doc,
    getDoc: firestore.getDoc,
    setDoc: firestore.setDoc,
  }));
}

let firestoreServicesPromise: ReturnType<typeof loadFirestoreServices> | null = null;

function getFirestoreServices() {
  if (!firestoreServicesPromise) firestoreServicesPromise = loadFirestoreServices();
  return firestoreServicesPromise;
}

/**
 * Loads personality test progress. Checks local IndexedDB cache first for
 * instantaneous load (0ms), and syncs with Firestore in the background for signed-in users.
 */
export async function loadPersonalityTest(user: AppUser): Promise<PersonalityTestData | null> {
  const local = await idb.get<PersonalityTestData & { id: string }>("settings", PT_SETTINGS_ID);
  
  if (isGuestUser(user)) {
    return local || null;
  }

  // If local cache is fresh, return it immediately
  if (local) {
    // Background refresh from Firestore without blocking UI
    void (async () => {
      try {
        const services = await getFirestoreServices();
        const snap = await services.getDoc(services.doc(services.db, "personality_tests", user.uid));
        if (snap.exists()) {
          const remote = snap.data() as PersonalityTestData;
          if (remote.updatedAt > (local.updatedAt || 0)) {
            await idb.put("settings", { ...remote, id: PT_SETTINGS_ID });
          }
        }
      } catch (err) {
        console.warn("Background personality test sync failed", err);
      }
    })();

    return local;
  }

  try {
    const services = await getFirestoreServices();
    const snap = await services.getDoc(services.doc(services.db, "personality_tests", user.uid));
    if (snap.exists()) {
      const data = snap.data() as PersonalityTestData;
      await idb.put("settings", { ...data, id: PT_SETTINGS_ID });
      return data;
    }
    return null;
  } catch (err) {
    console.warn("Failed to fetch personality test from Firestore, checking local", err);
    return local || null;
  }
}

/**
 * Saves personality test progress. Writes to local IndexedDB immediately
 * for instant 0ms UI feedback, then syncs to Firestore asynchronously.
 */
export async function savePersonalityTest(user: AppUser, data: PersonalityTestData): Promise<void> {
  // Always write locally first for immediate responsiveness
  await idb.put("settings", { ...data, id: PT_SETTINGS_ID });

  if (isGuestUser(user)) {
    return;
  }

  try {
    const services = await getFirestoreServices();
    await services.setDoc(services.doc(services.db, "personality_tests", user.uid), data, { merge: true });
  } catch (err) {
    console.warn("Failed to sync personality test to Firestore", err);
  }
}
