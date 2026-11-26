import { Suspense, lazy, useEffect, Component, ErrorInfo, ReactNode, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { AppShell } from "@/components/layout/AppShell";
// Note: ShareMindModal, ReportBugModal, and NotFound are kept as eager
// imports. They were tried as lazy chunks, but the lazy wrapper machinery
// added ~5KB to the entry chunk while the modals themselves only totaled
// ~4.4KB gzipped — a net loss on first paint. Eager is the right call
// here; the AppShell AlertDialog (a larger radix primitive) IS lazy
// because that one's savings exceed the wrapper cost.
import { ShareMindModal } from "@/components/ShareMindModal";
import { ReportBugModal } from "./ReportBugModal";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useMissionReminders } from "@/hooks/use-mission-reminders";
import { useRouteAnalytics, useSessionAnalytics } from "@/hooks/use-analytics";
import { AuthProvider } from "@/components/auth/AuthContext";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { idb } from "@/lib/db";
import { Post, Topic, Mind } from "@/lib/types";
import NotFound from "@/pages/not-found";
import { reportError } from "@/lib/error-monitor";
import { safeStorage } from "@/lib/safe-storage";
import { unregisterStaleServiceWorkers } from "@/lib/sw-cleanup";
import { runHiveMindMaintenance } from "@/lib/hive-mind";
import { setQueryClientRef } from "@/lib/analytics";

const QUERY_RETRY_ATTEMPTS = 1;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      retry: QUERY_RETRY_ATTEMPTS,
    },
  },
});

// All routes are code-split so heavy vendor chunks (firebase, d3, charts,
// framer-motion) only load when the user visits the screen that needs them.
const HomeFeed = lazy(() => import("@/pages/HomeFeed").then(module => ({ default: module.HomeFeed })));
const LibraryPage = lazy(() => import("@/pages/LibraryPage").then(module => ({ default: module.LibraryPage })));
const TopicsPage = lazy(() => import("@/pages/TopicsPage").then(module => ({ default: module.TopicsPage })));
const TopicDetailPage = lazy(() => import("@/pages/TopicDetailPage").then(module => ({ default: module.TopicDetailPage })));
const ProfilePage = lazy(() => import("@/pages/ProfilePage").then(module => ({ default: module.ProfilePage })));
const SearchPage = lazy(() => import("@/pages/SearchPage").then(module => ({ default: module.SearchPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then(module => ({ default: module.SettingsPage })));
const MissionsPage = lazy(() => import("@/pages/MissionsPage").then(module => ({ default: module.MissionsPage })));
const PersonalityTestPage = lazy(() => import("@/pages/PersonalityTestPage"));
const OnboardingFlow = lazy(() => import("@/components/onboarding/OnboardingFlow"));
const MessagesPage = lazy(() => import("@/pages/MessagesPage").then(module => ({ default: module.MessagesPage })));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage").then(module => ({ default: module.NotificationsPage })));
const CommunityPage = lazy(() => import("@/pages/CommunityPage").then(module => ({ default: module.CommunityPage })));

function PageLoader() {
  return (
    // dvh: on mobile the address bar makes 100vh taller than the visible
    // viewport, so the loader could overflow. dvh is used where supported
    // (Chrome 108+/Safari 15.4+), vh stays as the fallback.
    <div className="flex h-[calc(100vh-8rem)] supports-[height:100dvh]:h-[calc(100dvh-8rem)] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function usePrefetch() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Prefetch posts
    queryClient.prefetchQuery({
      queryKey: ["posts"],
      queryFn: async () => {
        const allPosts = await idb.getAll<Post>("posts");
        return allPosts.sort((a, b) => b.createdAt - a.createdAt);
      }
    });

    // Prefetch topics
    queryClient.prefetchQuery({
      queryKey: ["topics"],
      queryFn: async () => {
        const allTopics = await idb.getAll<Topic>("topics");
        return [...allTopics].sort((a, b) => {
          const orderA = a.order !== undefined ? a.order : 999999;
          const orderB = b.order !== undefined ? b.order : 999999;
          return orderA - orderB;
        });
      }
    });

    // Prefetch minds
    queryClient.prefetchQuery({
      queryKey: ["minds"],
      queryFn: async () => {
        const allMinds = await idb.getAll<Mind>("minds");
        return allMinds;
      }
    });
  }, [queryClient]);
}

interface ErrorBoundaryProps {
  children: ReactNode;
  toast: (options: { title: string; description: string; variant?: "destructive" | "default" }) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Route Error caught by boundary:", error, errorInfo);
    reportError({
      message: error.message || "Route render error",
      name: error.name,
      stack: error.stack,
      at: Date.now(),
    });

    const now = Date.now();
    let timestamps: number[] = [];
    try {
      const stored = localStorage.getItem("mind_builder_error_timestamps");
      if (stored) {
        timestamps = JSON.parse(stored);
        if (!Array.isArray(timestamps)) timestamps = [];
      }
    } catch {
      timestamps = [];
    }

    // Check if a second error occurred within 15 seconds of the last error
    const isSecondErrorWithin15Sec = timestamps.length > 0 && (now - timestamps[timestamps.length - 1] <= 15000);

    // Update timestamps: store last 2 error timestamps in localStorage
    timestamps.push(now);
    if (timestamps.length > 2) {
      timestamps = timestamps.slice(-2);
    }
    safeStorage.setItem("mind_builder_error_timestamps", JSON.stringify(timestamps));

    if (isSecondErrorWithin15Sec) {
      // Second error within 15s: this is a persistent/deterministic error.
      // Reset the boundary state and redirect to home feed + open the bug
      // report modal so the user can report it. Do NOT auto-reload — the
      // old code did window.location.reload() here, which caused an
      // infinite reload loop on deterministic errors (the page would
      // reload, hit the same error, reload again, forever).
      safeStorage.setItem("mind_builder_open_bug_modal", "true");
      safeStorage.setItem("mind_builder_error_message", error.message || "Unknown error");

      this.props.toast({
        title: "Persistent Error Encountered",
        description: "Returning to home feed and opening bug report modal.",
        variant: "destructive",
      });
      // Reset the boundary so the route can re-render without the error.
      this.setState({ hasError: false, error: null });
    } else {
      // First error (or > 15s since last): just reset the boundary state
      // so the route re-renders. The RouteErrorFallback will redirect to
      // home feed. Do NOT reload — reloading deterministic errors causes
      // an infinite loop.
      // The state reset happens in render() via RouteErrorFallback's
      // onReset callback, so we just let it proceed.
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <RouteErrorFallback 
          onReset={() => this.setState({ hasError: false, error: null })} 
          error={this.state.error}
        />
      );
    }

    return this.props.children;
  }
}

function RouteErrorFallback({ onReset, error }: { onReset: () => void; error: Error | null }) {
  const [location, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(false);

  // PERMANENT FIX: do NOT auto-redirect to "/". The old code did
  // setLocation("/") on every error, which caused two symptoms:
  //   1. "Blank home page" — if "/" itself errored, the fallback rendered
  //      null + redirected to "/" (already on "/") → blank screen.
  //   2. "Other features returning home" — clicking Topics/Messages/etc
  //      and hitting any render error bounced the user back to "/" with
  //      no explanation, looking like the feature was broken.
  // Instead, render a recoverable error card with explicit user choice.
  // Auto-recovery attempts (location reload) are gated behind a flag the
  // user can click — no more forced redirects.

  if (dismissed) {
    return null;
  }

  const isHome = location === "/" || location === "";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        <Loader2 className="h-6 w-6 animate-spin text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">This screen hit a snag</h2>
        <p className="text-sm text-muted-foreground">
          {isHome
            ? "The home feed failed to render. Try reloading — your data is safe in IndexedDB."
            : "This page failed to render. You can go back home or try again."}
        </p>
        {error && (
          <details className="mt-2 text-left text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">Error details</summary>
            <pre className="mt-2 max-w-md overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
              {error.message || "Unknown error"}
            </pre>
          </details>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            // Hard reload: bypasses HTTP cache, fetches fresh HTML.
            window.location.reload();
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Reload page
        </button>
        {!isHome && (
          <button
            type="button"
            onClick={() => {
              onReset();
              setDismissed(true);
              setLocation("/");
            }}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Go to home
          </button>
        )}
        {isHome && (
          <button
            type="button"
            onClick={() => {
              onReset();
              setDismissed(true);
            }}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function GlobalBugModalManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [defaultError, setDefaultError] = useState("");

  useEffect(() => {
    // PREVIEW FIX: storage may be BLOCKED in this context (sandboxed preview
    // iframe / Safari ITP). This effect runs on the home screen — an unguarded
    // localStorage access here threw during React's commit phase and unmounted
    // the ENTIRE app (blank page). All reads/writes go through safeStorage.
    const shouldOpen =
      safeStorage.getItem("mind_builder_open_bug_modal") ||
      safeStorage.getSession("mind_builder_open_bug_modal");
    if (shouldOpen === "true") {
      const err =
        safeStorage.getItem("mind_builder_error_message") ||
        safeStorage.getSession("mind_builder_error_message") ||
        "Persistent application error";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate mount-sync of external storage flag → open ReportBugModal; reading storage in a lazy useState initializer would move a guarded read into the render phase (the effect is the safe place for blocked-storage access).
      setDefaultError(err);
      setIsOpen(true);
      safeStorage.removeItem("mind_builder_open_bug_modal");
      safeStorage.removeItem("mind_builder_error_message");
      safeStorage.removeSession("mind_builder_open_bug_modal");
      safeStorage.removeSession("mind_builder_error_message");
    }
  }, []);

  return (
    <ReportBugModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      defaultError={defaultError}
    />
  );
}

function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  return <ErrorBoundary toast={toast}>{children}</ErrorBoundary>;
}

function Router() {
  useShortcuts();
  usePrefetch();
  useMissionReminders();
  useSessionAnalytics();
  useRouteAnalytics();
  
  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>
        <RouteErrorBoundary>
          <Switch>
            <Route path="/" component={HomeFeed} />
            <Route path="/search" component={SearchPage} />
            <Route path="/missions" component={MissionsPage} />
            <Route path="/personality-test" component={PersonalityTestPage} />
            <Route path="/onboarding">
              <OnboardingFlow />
            </Route>
            <Route path="/community" component={CommunityPage} />
            <Route path="/messages" component={MessagesPage} />
            <Route path="/notifications" component={NotificationsPage} />
            <Route path="/profile" component={ProfilePage} />
            <Route path="/library" component={LibraryPage} />
            <Route path="/topics" component={TopicsPage} />
            <Route path="/topics/:id" component={TopicDetailPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route component={NotFound} />
          </Switch>
        </RouteErrorBoundary>
      </Suspense>
    </AppShell>
  );
}

function App() {
  useEffect(() => {
    // PERF: register the global QueryClient ref so trackEvent() can
    // invalidate the analytics_events query without the old 30s polling
    // refetch. This keeps the feed fresh after user actions without
    // burning CPU on a timer.
    setQueryClientRef(queryClient);
    return () => setQueryClientRef(null);
  }, []);

  useEffect(() => {
    // Run Hive-Mind maintenance on app boot: 14-day pruning, 30-day
    // fossilization, thread fork checks, 90-day reactivation.
    // Each check is rate-limited by its own localStorage timestamp
    // so calling on every boot is safe — only runs when due.
    void runHiveMindMaintenance();
    // No cleanup — maintenance is fire-and-forget.
  }, []);

  // PREVIEW FIX: Do NOT register a service worker when running inside an
  // iframe (the space-z.ai preview environment embeds the app in an
  // iframe). A stale SW from a previous broken session can intercept
  // the iframe's navigation and serve cached dev-mode HTML (with
  // /@vite/client) that 404s in production → blank preview. SW is only
  // useful when the app is standalone (installed PWA / direct visit).
  // When in an iframe, UNREGISTER any existing SW to clear stale caches.
  // PREVIEW FIX (PERMANENT): Always unregister any service worker. The SW's
  // cache-first strategy for static assets serves STALE JS chunks from a
  // previous build after a new deploy. New index.html references new chunk
  // hashes, but the SW serves old chunks from cache → chunk-load failure →
  // ErrorBoundary → "home feed failed to render". The Express server already
  // sets proper cache headers (maxAge=1y, immutable) on content-addressed
  // chunks, so the browser's HTTP cache is sufficient — no SW needed.
  useEffect(() => {
    // Sandbox-safe: reading navigator.serviceWorker itself throws in
    // opaque-origin iframes (sandbox without allow-same-origin) — an
    // unguarded read here unmounted the whole React tree (blank home
    // screen, zero /api/feed calls). lib/sw-cleanup guards the access.
    unregisterStaleServiceWorkers();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="mind-builder-theme">
        <TooltipProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <ShareMindModal />
            <GlobalBugModalManager />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
