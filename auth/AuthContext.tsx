import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { UserProfile } from "@/lib/types";
import { AppUser, isGuestUser } from "@/lib/user-data";
import { idb } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrainCircuit, UserRound, Mail, Lock, User as UserIcon, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";

interface AuthContextType {
  user: AppUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isGuest: boolean;
  signIn: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  logOut: () => Promise<void>;
  updateProfileData: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const GUEST_STORAGE_KEY = "brain-builder-guest";
const GUEST_PROFILE_ID = "guest-profile";
const ONBOARDED_KEY = "brain-drain-onboarded";

function makeGuestProfile(uid: string): UserProfile {
  return {
    id: uid,
    username: `guest_${uid.substring(6, 11)}`,
    displayName: "Guest Builder",
    bio: "Exploring the limits of logic graphs and social knowledge.",
    followerCount: 0,
    followingCount: 0,
  };
}

function loadFirebaseServices() {
  return Promise.all([
    import("@/lib/firebase-auth"),
    import("firebase/auth"),
  ]).then(([firebase, authApi]) => ({
    auth: firebase.auth,
    onAuthStateChanged: authApi.onAuthStateChanged,
    signInWithPopup: authApi.signInWithPopup,
    GoogleAuthProvider: authApi.GoogleAuthProvider,
    signOut: authApi.signOut,
    // Email/password providers (Phase 2)
    createUserWithEmailAndPassword: authApi.createUserWithEmailAndPassword,
    signInWithEmailAndPassword: authApi.signInWithEmailAndPassword,
    updateProfile: authApi.updateProfile,
  }));
}

let firebaseServicesPromise: ReturnType<typeof loadFirebaseServices> | null = null;
let firestoreServicesPromise: ReturnType<typeof loadFirestoreServices> | null = null;

function getFirebaseServices() {
  if (!firebaseServicesPromise) firebaseServicesPromise = loadFirebaseServices();
  return firebaseServicesPromise;
}

function loadFirestoreServices() {
  return Promise.all([
    import("@/lib/firebase-firestore"),
    import("firebase/firestore"),
  ]).then(([firebase, firestoreApi]) => ({
    db: firebase.db,
    doc: firestoreApi.doc,
    getDoc: firestoreApi.getDoc,
    setDoc: firestoreApi.setDoc,
  }));
}

function getFirestoreServices() {
  if (!firestoreServicesPromise) firestoreServicesPromise = loadFirestoreServices();
  return firestoreServicesPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  // useRef for the firebase auth unsubscribe function — shared between the
  // mount effect and the signIn handler so signIn can check whether
  // onAuthStateChanged has already been set up before subscribing.
  // Also holds `guestSessionActiveRef` so signIn can disable the guest
  // session immediately when a real user signs in (B.8 fix — prevents the
  // theoretical race where restoreGuestSession's async IDB read resolves
  // after the real user is already signed in, overwriting them with the
  // guest profile).
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
  const guestSessionActiveRef = useRef<boolean>(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(ONBOARDED_KEY);
    } catch {
      // localStorage may throw in private mode / sandboxed iframes — default
      // to showing onboarding in that case.
      return true;
    }
  });
  const { toast } = useToast();

  const finishOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      // Ignore storage write failures (private mode / quota).
    }
    setShowOnboarding(false);
  };

  useEffect(() => {
    let isMounted = true;
    let guestId: string | null = null;
    try {
      guestId = localStorage.getItem(GUEST_STORAGE_KEY);
    } catch {
      // localStorage unavailable — proceed as if there were no guest session.
      guestId = null;
    }
    let guestSessionActive = Boolean(guestId);
    guestSessionActiveRef.current = guestSessionActive;

    const restoreGuestSession = async (uid: string) => {
      const guestUser: AppUser = { id: uid, uid, displayName: "Guest Builder", email: null, photoURL: null };
      let guestProfile = makeGuestProfile(uid);
      try {
        const localProfile = await idb.get<UserProfile>("profile", GUEST_PROFILE_ID);
        guestProfile = localProfile || guestProfile;
      } catch {
        // Local profile storage is best-effort.
      }
      if (!isMounted || !guestSessionActive) return;
      setUser(guestUser);
      setProfile(guestProfile);
      setLoading(false);
    };

    const handleAuthFailure = (error: unknown) => {
      console.error("Firebase auth initialization failed:", error);
      if (guestId) {
        guestSessionActive = true;
        void restoreGuestSession(guestId);
      } else if (isMounted) {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
      toast({
        title: "Authentication unavailable",
        description: "You can continue as a guest while sign-in reconnects.",
      });
    };

    const initializeAuth = async () => {
      try {
        const services = await getFirebaseServices();
        if (!isMounted) return;

        unsubscribeRef.current = services.onAuthStateChanged(
          services.auth,
          async (currentUser) => {
            if (!isMounted) return;

            if (currentUser) {
              guestSessionActive = false;
              const appUser: AppUser = {
                id: currentUser.uid,
                uid: currentUser.uid,
                displayName: currentUser.displayName,
                email: currentUser.email,
                photoURL: currentUser.photoURL,
              };
              setUser(appUser);

              try {
                const firestore = await getFirestoreServices();
                const userDocRef = firestore.doc(firestore.db, "users", currentUser.uid);
                const userDoc = await firestore.getDoc(userDocRef);
                if (userDoc.exists()) {
                  setProfile(userDoc.data() as UserProfile);
                } else {
                  const newProfile: UserProfile = {
                    id: currentUser.uid,
                    username: currentUser.email?.split("@")[0] || `user_${currentUser.uid.substring(0, 5)}`,
                    displayName: currentUser.displayName || "New Builder",
                    bio: "Exploring the limits of logic graphs and social knowledge.",
                    avatarUrl: currentUser.photoURL || undefined,
                    followerCount: 0,
                    followingCount: 0,
                  };
                  await firestore.setDoc(userDocRef, newProfile);
                  setProfile(newProfile);
                }
              } catch (error: unknown) {
                console.error("Error fetching/creating profile:", error);
                setProfile({
                  id: currentUser.uid,
                  username: currentUser.email?.split("@")[0] || "builder",
                  displayName: currentUser.displayName || "Builder",
                  bio: "",
                  avatarUrl: currentUser.photoURL || undefined,
                  followerCount: 0,
                  followingCount: 0,
                });
                toast({ title: "Profile Sync Issue", description: "Working with a local profile. Changes will sync when possible." });
              }
              if (isMounted) setLoading(false);
            } else if (guestId) {
              guestSessionActive = true;
              await restoreGuestSession(guestId);
            } else {
              setUser(null);
              setProfile(null);
              setLoading(false);
            }
          },
          handleAuthFailure,
        );
      } catch (error: unknown) {
        handleAuthFailure(error);
      }
    };

    // PERFORMANCE: if the user has a guest session, skip firebase
    // initialization on mount. Firebase auth (~200KB gzipped) is only
    // needed when the user actually clicks "Sign in with Google" —
    // loading it eagerly on every app boot delays first paint for guest
    // users who will never sign in. The guest session is restored
    // below; if the user later clicks "Sign in", the `signIn` function
    // loads firebase on demand and `onAuthStateChanged` is set up at
    // that point.
    //
    // If there's no guest session, we DO initialize firebase on mount
    // because the user might have a stale signed-in session that
    // `onAuthStateChanged` would restore.
    if (guestId) {
      // Guest session active — restore it and skip firebase init.
      void restoreGuestSession(guestId);
    } else {
      // No guest session — initialize firebase to check for a real session.
      void initializeAuth();
    }

    // SL-LOAD FIX: cap the loading screen at 2.5s. If Firebase auth
    // hasn't resolved by then (network blocked, ad-blocker, slow CDN,
    // offline, etc.), fall back to a fresh guest session so the user
    // is NEVER stuck on a blank "Loading..." screen. The real auth
    // state, when it eventually resolves, will replace the guest.
    const loadingFallbackMs = 2500;
    const loadingFallback = window.setTimeout(() => {
      if (!isMounted) return;
      setLoading((currentlyLoading) => {
        if (!currentlyLoading) return false;
        // Mark a fresh guest so subsequent boots skip firebase init
        // entirely (until the user explicitly signs in).
        const freshGuestId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        try { localStorage.setItem(GUEST_STORAGE_KEY, freshGuestId); } catch { /* ignore */ }
        guestSessionActive = true;
        guestSessionActiveRef.current = true;
        void restoreGuestSession(freshGuestId);
        // Don't toast — silent fallback. The user doesn't need to know
        // they're on a guest session; if firebase later resolves with
        // a real session, it'll swap in seamlessly.
        return false;
      });
    }, loadingFallbackMs);
    return () => {
      isMounted = false;
      window.clearTimeout(loadingFallback);
      unsubscribeRef.current?.();
    };
  }, [toast]);

  const signIn = async () => {
    setSigningIn(true);
    // Disable the guest session immediately so restoreGuestSession's
    // async IDB read can't overwrite the real user after sign-in (B.8 fix).
    guestSessionActiveRef.current = false;
    try {
      const services = await getFirebaseServices();
      await services.signInWithPopup(services.auth, new services.GoogleAuthProvider());
      try {
        localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {
        // Ignore — best-effort cleanup of the guest marker.
      }
      // After a successful sign-in, set up onAuthStateChanged so we
      // continue tracking the auth state (the mount effect skipped
      // firebase init because the user was a guest). Without this,
      // the user would be signed in but the AuthContext wouldn't
      // observe future auth changes (sign-out, token refresh, etc.).
      // We guard with `!unsubscribeRef.current` so we don't double-subscribe if
      // the mount effect already set it up (e.g. user had no guest
      // session and firebase init already ran).
      if (!unsubscribeRef.current) {
        const signInMounted = true;
        unsubscribeRef.current = services.onAuthStateChanged(
          services.auth,
          async (currentUser) => {
            if (!signInMounted) return;
            if (currentUser) {
              const appUser: AppUser = {
                id: currentUser.uid,
                uid: currentUser.uid,
                displayName: currentUser.displayName,
                email: currentUser.email,
                photoURL: currentUser.photoURL,
              };
              setUser(appUser);
              try {
                const firestore = await getFirestoreServices();
                if (!signInMounted) return;
                const userDocRef = firestore.doc(firestore.db, "users", currentUser.uid);
                const userDoc = await firestore.getDoc(userDocRef);
                if (!signInMounted) return;
                if (userDoc.exists()) {
                  setProfile(userDoc.data() as UserProfile);
                } else {
                  const newProfile: UserProfile = {
                    id: currentUser.uid,
                    username: currentUser.email?.split("@")[0] || `user_${currentUser.uid.substring(0, 5)}`,
                    displayName: currentUser.displayName || "New Builder",
                    bio: "Exploring the limits of logic graphs and social knowledge.",
                    avatarUrl: currentUser.photoURL || undefined,
                    followerCount: 0,
                    followingCount: 0,
                  };
                  await firestore.setDoc(userDocRef, newProfile);
                  if (signInMounted) setProfile(newProfile);
                }
              } catch {
                if (signInMounted) {
                  setProfile({
                    id: currentUser.uid,
                    username: currentUser.email?.split("@")[0] || "builder",
                    displayName: currentUser.displayName || "Builder",
                    bio: "",
                    avatarUrl: currentUser.photoURL || undefined,
                    followerCount: 0,
                    followingCount: 0,
                  });
                }
              }
            } else {
              // currentUser === null — sign-out event. Clear state so the
              // UI returns to the sign-in screen immediately (B.1 fix).
              setUser(null);
              setProfile(null);
              setLoading(false);
            }
          },
          (error: unknown) => {
            // Error callback — firebase auth errors after sign-in (token
            // refresh failure, network) are surfaced instead of silently
            // dropped (B.1 fix).
            console.error("onAuthStateChanged error:", error);
            if (signInMounted) {
              toast({
                title: "Authentication error",
                description: "Your session may have expired. Please sign in again.",
                variant: "destructive",
              });
            }
          },
        );
      }
    } catch (error: unknown) {
      console.error("Error signing in", error);
      const code = (error as { code?: string })?.code;
      const blocked = code === "auth/popup-blocked" || code === "auth/cancelled-popup-request" || code === "auth/popup-closed-by-user";
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Sign-in Failed",
        description: blocked
          ? "The sign-in popup was blocked or closed. You can continue as a guest instead."
          : message || "Could not sign in. You can continue as a guest instead.",
        variant: "destructive",
      });
    } finally {
      setSigningIn(false);
    }
  };

  // ── Phase 2: Email/password sign-in + sign-up ──────────────────────
  // These use Firebase's createUserWithEmailAndPassword + signInWithEmailAndPassword.
  // The onAuthStateChanged listener (set up in the mount effect) picks up the
  // signed-in user and populates `user` + `profile` state — same as Google sign-in.

  const signInWithEmail = async (email: string, password: string) => {
    setSigningIn(true);
    guestSessionActiveRef.current = false;
    try {
      const services = await getFirebaseServices();
      await services.signInWithEmailAndPassword(services.auth, email.trim(), password);
      try {
        localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {
        // Best-effort cleanup.
      }
      // Subscribe to auth state changes if not already subscribed (same
      // rationale as the Google signIn — see comment there).
      if (!unsubscribeRef.current) {
        const signInMounted = true;
        unsubscribeRef.current = services.onAuthStateChanged(services.auth, async (currentUser) => {
          if (!signInMounted || !currentUser) return;
          const appUser: AppUser = {
            id: currentUser.uid,
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            email: currentUser.email,
            photoURL: currentUser.photoURL,
          };
          setUser(appUser);
        });
      }
    } catch (error: unknown) {
      console.error("Email sign-in failed:", error);
      // Firebase error codes: auth/invalid-credential, auth/user-not-found,
      // auth/wrong-password, auth/too-many-requests, auth/user-disabled
      const code = (error as { code?: string })?.code || "";
      let message = "Could not sign in. Check your email and password.";
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        message = "Invalid email or password.";
      } else if (code === "auth/too-many-requests") {
        message = "Too many attempts. Try again later or reset your password.";
      } else if (code === "auth/user-disabled") {
        message = "This account has been disabled.";
      } else if (code === "auth/invalid-email") {
        message = "That doesn't look like a valid email address.";
      }
      toast({
        title: "Sign-in failed",
        description: message,
        variant: "destructive",
      });
      throw new Error(message, { cause: error });
    } finally {
      setSigningIn(false);
    }
  };

  const signUpWithEmail = async (email: string, password: string, displayName: string) => {
    setSigningIn(true);
    guestSessionActiveRef.current = false;
    try {
      const services = await getFirebaseServices();
      const cred = await services.createUserWithEmailAndPassword(services.auth, email.trim(), password);
      // Set the display name on the newly-created user.
      if (cred.user && displayName.trim()) {
        await services.updateProfile(cred.user, { displayName: displayName.trim() });
      }
      try {
        localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {
        // Best-effort cleanup.
      }
      // The onAuthStateChanged listener will pick up the new user.
      if (!unsubscribeRef.current) {
        const signUpMounted = true;
        unsubscribeRef.current = services.onAuthStateChanged(services.auth, async (currentUser) => {
          if (!signUpMounted || !currentUser) return;
          const appUser: AppUser = {
            id: currentUser.uid,
            uid: currentUser.uid,
            displayName: currentUser.displayName || displayName.trim(),
            email: currentUser.email,
            photoURL: currentUser.photoURL,
          };
          setUser(appUser);
        });
      }
      toast({
        title: "Account created",
        description: `Welcome, ${displayName.trim()}! Your account is ready.`,
      });
    } catch (error: unknown) {
      console.error("Email sign-up failed:", error);
      const code = (error as { code?: string })?.code || "";
      let message = "Could not create account. Please try again.";
      if (code === "auth/email-already-in-use") {
        message = "An account with this email already exists. Try signing in instead.";
      } else if (code === "auth/invalid-email") {
        message = "That doesn't look like a valid email address.";
      } else if (code === "auth/weak-password") {
        message = "Password is too weak. Use at least 6 characters.";
      }
      toast({
        title: "Sign-up failed",
        description: message,
        variant: "destructive",
      });
      throw new Error(message, { cause: error });
    } finally {
      setSigningIn(false);
    }
  };

  const continueAsGuest = async () => {
    const guestId = `guest-${crypto.randomUUID().substring(0, 8)}`;
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, guestId);
    } catch (error: unknown) {
      console.error("Failed to persist guest marker in localStorage", error);
      // Continue anyway — the in-memory user/profile are set below.
    }
    const guestUser: AppUser = { id: guestId, uid: guestId, displayName: "Guest Builder", email: null, photoURL: null };
    const guestProfile = makeGuestProfile(guestId);
    try {
      await idb.put("profile", { ...guestProfile, id: GUEST_PROFILE_ID });
    } catch (error: unknown) {
      console.error("Failed to persist guest profile", error);
    }
    setUser(guestUser);
    setProfile(guestProfile);
  };

  const logOut = async () => {
    try {
      try {
        localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {
        // Best-effort cleanup of the guest marker.
      }
      if (user && isGuestUser(user)) {
        setUser(null);
        setProfile(null);
        return;
      }
      // For signed-in (firebase) users: sign out from firebase, then
      // explicitly clear React state. The signIn handler's
      // onAuthStateChanged listener only handles the `currentUser`
      // case (no `else` branch), so relying on it to fire with `null`
      // after signOut would leave the UI stuck on the authenticated
      // view. We clear state here so the user sees the sign-in screen
      // immediately.
      const services = await getFirebaseServices();
      await services.signOut(services.auth);
      setUser(null);
      setProfile(null);
      setLoading(false);
      // Reset the unsubscribe ref so a future signIn can re-subscribe.
      unsubscribeRef.current = undefined;
    } catch (error: unknown) {
      console.error("Error signing out", error);
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: "Sign-out Failed", description: message || "Could not sign out.", variant: "destructive" });
    }
  };

  const updateProfileData = async (data: Partial<UserProfile>) => {
    if (!user || !profile) return;
    const updatedProfile = { ...profile, ...data };
    try {
      if (isGuestUser(user)) {
        await idb.put("profile", { ...updatedProfile, id: GUEST_PROFILE_ID });
      } else {
        const firestore = await getFirestoreServices();
        await firestore.setDoc(firestore.doc(firestore.db, "users", user.uid), updatedProfile, { merge: true });
      }
      setProfile(updatedProfile);
    } catch (error: unknown) {
      console.error("Error updating profile", error);
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: "Update Failed", description: message || "Could not update profile.", variant: "destructive" });
    }
  };

  if (loading) {
    // SL-LOAD FIX: don't render a blank "Loading..." screen — show a
    // branded splash that matches the app's theme. The 2.5s timeout
    // above guarantees this is replaced by the app (or sign-in screen)
    // quickly even if Firebase is unreachable.
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background gap-4">
        <div className="relative">
          <BrainCircuit className="w-12 h-12 text-primary animate-pulse" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Warming up your brain…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    if (showOnboarding) {
      return (
        <OnboardingTour
          onFinish={finishOnboarding}
          onTrySample={async () => {
            // Flag the app to open a sample brain once the guest lands.
            try {
              sessionStorage.setItem("brain-drain-open-sample", "1");
            } catch {
              // ignore storage errors (private mode)
            }
            finishOnboarding();
            await continueAsGuest();
          }}
        />
      );
    }
    return (
      <SignInScreen
        signingIn={signingIn}
        onGoogleSignIn={signIn}
        onEmailSignIn={signInWithEmail}
        onEmailSignUp={signUpWithEmail}
        onContinueAsGuest={continueAsGuest}
      />
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, isGuest: isGuestUser(user), signIn, signInWithEmail, signUpWithEmail, logOut, updateProfileData }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// ── Phase 2: Sign-in screen with email/password + Google + Guest ──────────
//
// Extracted as a separate component so the form state (email, password,
// display name, mode toggle) doesn't trigger re-renders of the entire
// AuthProvider on every keystroke.

interface SignInScreenProps {
  signingIn: boolean;
  onGoogleSignIn: () => Promise<void>;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (email: string, password: string, displayName: string) => Promise<void>;
  onContinueAsGuest: () => Promise<void>;
}

function SignInScreen({
  signingIn,
  onGoogleSignIn,
  onEmailSignIn,
  onEmailSignUp,
  onContinueAsGuest,
}: SignInScreenProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || signingIn) return;
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await onEmailSignIn(email, password);
      } else {
        if (!displayName.trim()) {
          throw new Error("Please enter your display name.");
        }
        await onEmailSignUp(email, password, displayName);
      }
      // On success, the AuthProvider's onAuthStateChanged listener will
      // populate `user` and unmount this screen. No explicit reset needed.
    } catch {
      // Error toast is already shown by the AuthProvider methods.
      // Stay on the form so the user can retry.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-background p-6 overflow-y-auto">
      <div className="max-w-md w-full bg-card border rounded-[16px] p-8 text-center shadow-lg">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-[16px] flex items-center justify-center mx-auto mb-6">
          <BrainCircuit className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Welcome to Brain Drain</h1>
        <p className="text-sm font-semibold text-primary mb-1">The Next Human LLM</p>
        <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
          A human knowledge engine where experts drain their reasoning into
          structured decision brains. Readers vote every comment up or down
          and classify it House or Mouth — the strongest reasoning rises
          into a living consensus library.
        </p>
        <p className="text-xs text-muted-foreground/70 italic mb-6">
          This is not a social feed. It's a living library of expert knowledge.
        </p>

        {/* Email/password form */}
        <form onSubmit={handleSubmit} className="space-y-3 text-left mb-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="displayName" className="text-xs font-medium">Display name</Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="pl-9"
                  required
                  autoComplete="name"
                />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
                required
                autoComplete="email"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-medium">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
                required
                minLength={6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={submitting || signingIn}
            className="w-full py-3 rounded-[12px]"
          >
            {submitting || signingIn
              ? "Please wait..."
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>

        {/* Toggle between sign-in and sign-up */}
        <p className="text-xs text-muted-foreground mb-4">
          {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-primary hover:underline font-medium"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Google + Guest */}
        <div className="space-y-3">
          <Button
            onClick={onGoogleSignIn}
            disabled={signingIn || submitting}
            variant="outline"
            className="w-full py-3 rounded-[12px] gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>
          <Button
            onClick={onContinueAsGuest}
            variant="ghost"
            className="w-full py-3 rounded-[12px] gap-2 text-muted-foreground"
          >
            <UserRound className="w-5 h-5" />
            Continue as Guest
          </Button>
          <p className="text-xs text-muted-foreground pt-2">
            Guest mode stores everything on this device. Sign in later to sync across devices.
          </p>
        </div>
      </div>
    </div>
  );
}
