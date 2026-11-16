/**
 * lib/safe-storage.ts — Storage access that NEVER throws.
 *
 * PREVIEW FIX (blank home screen in blocked-storage contexts):
 *
 * In the z.ai preview iframe and Safari ITP third-party contexts, merely
 * ACCESSING localStorage/sessionStorage throws SecurityError. Several
 * components read storage in render paths and mount effects
 * (App.tsx GlobalBugModalManager, SearchPage recents). One unguarded read
 * there throws during React's commit phase → React unmounts the whole tree
 * → BLANK PAGE — even though all data hooks were storage-safe.
 *
 * Rule: every storage access outside lib/db.ts must go through this
 * wrapper (or be individually try/catch-guarded). Reads return null on
 * failure; writes/remove are silent no-ops.
 */

function ls(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function ss(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const safeStorage = {
  /** localStorage.getItem that returns null instead of throwing. */
  getItem(key: string): string | null {
    const store = ls();
    if (!store) return null;
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  },

  /** localStorage.setItem that is a silent no-op instead of throwing. */
  setItem(key: string, value: string): void {
    const store = ls();
    if (!store) return;
    try {
      store.setItem(key, value);
    } catch {
      // quota exceeded / blocked — non-fatal by design
    }
  },

  /** localStorage.removeItem that is a silent no-op instead of throwing. */
  removeItem(key: string): void {
    const store = ls();
    if (!store) return;
    try {
      store.removeItem(key);
    } catch {
      // non-fatal
    }
  },

  /** sessionStorage.getItem that returns null instead of throwing. */
  getSession(key: string): string | null {
    const store = ss();
    if (!store) return null;
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  },

  /** sessionStorage.setItem that is a silent no-op instead of throwing. */
  setSession(key: string, value: string): void {
    const store = ss();
    if (!store) return;
    try {
      store.setItem(key, value);
    } catch {
      // non-fatal
    }
  },

  /** sessionStorage.removeItem that is a silent no-op instead of throwing. */
  removeSession(key: string): void {
    const store = ss();
    if (!store) return;
    try {
      store.removeItem(key);
    } catch {
      // non-fatal
    }
  },
};
