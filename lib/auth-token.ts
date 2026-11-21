/**
 * Auth token helpers. We dynamically import firebase-auth so that the heavy
 * firebase/auth chunk is only loaded when a signed-in user makes an API call,
 * preserving the route-level code-splitting done elsewhere.
 */

/** Capture identity and token from the same Firebase user, for account-scoped work. */
export async function getAuthSession(): Promise<{ uid: string; token: string | null } | null> {
  const { auth } = await import("./firebase-auth");
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const token = await user.getIdToken();
    return auth.currentUser === user ? { uid: user.uid, token } : null;
  } catch {
    return auth.currentUser === user ? { uid: user.uid, token: null } : null;
  }
}

export async function getAuthToken(forceRefresh = false): Promise<string | null> {
  const { auth } = await import("./firebase-auth");
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

export async function onAuthChanged(cb: (signedIn: boolean) => void): Promise<() => void> {
  const { auth } = await import("./firebase-auth");
  return auth.onAuthStateChanged((user) => cb(Boolean(user)));
}
