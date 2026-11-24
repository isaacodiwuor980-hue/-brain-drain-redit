import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Link, useLocation } from "wouter";
import {
  Home,
  Search,
  User,
  Library,
  Hash,
  Settings,
  Brain,
  BrainCircuit,
  MessageSquare,
  Bell,
  Users,
  Rocket,
  ArrowLeft,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConnectionLoader } from "@/components/ui/connection-loader";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { SyncAttentionNotice } from "./SyncAttentionNotice";
import { triggerHaptic } from "@/lib/device";
import { CreateMenu } from "@/components/CreateMenu";
import { isNavActive } from "@/lib/navigation";
import { Loader2 } from "lucide-react";

// The mobile bottom-sheet uses framer-motion; lazy-load it so the ~130kB
// library stays off the critical path for desktop / first paint on 3G.
const MobileNavDrawer = lazy(() =>
  import("@/components/layout/MobileNavDrawer").then((m) => ({ default: m.MobileNavDrawer })),
);
// PERF: the unsaved-changes AlertDialog is a radix primitive that was EAGERLY
// imported here, which dragged the 141 KB `radix-lazy` chunk (44 KB gzip)
// onto the first-paint critical path for every visitor — even though the
// dialog can only appear after the user edits something and tries to leave.
// Lazy-load it behind the same dirty-check that opens it.
const UnsavedChangesDialog = lazy(() =>
  import("@/components/layout/unsaved-changes-dialog").then((m) => ({ default: m.UnsavedChangesDialog })),
);

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const closeMobileDrawer = useCallback(() => setIsMobileDrawerOpen(false), []);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const isOffline = useOnlineStatus() === "offline";
  const { pendingCount, deadLetterCount, isSyncing } = useOfflineSync();

  // SAFETY NET: clear __isAppDirty on every route change. The dirty flag
  // is set by WizardModal/SettingsPage when the user has unsaved changes.
  // If it gets stuck (component unmounts without cleanup, or a race
  // condition), ALL navigation is blocked because handleLinkClick checks
  // it. This safety net ensures navigation ALWAYS works even if the dirty
  // flag is stuck — the worst case is the user loses unsaved changes,
  // which is better than being completely unable to navigate.
  useEffect(() => {
    // Don't clear on the initial mount — let the component set it.
    return () => {
      window.__isAppDirty = false;
    };
  }, [location]);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    // PERF: throttle the scroll handler with requestAnimationFrame so it
    // fires at most once per frame instead of on every scroll event (which
    // can be 60+ times/sec on a fast trackpad). Also only setState when
    // the value actually changes — the old code called setShowBackToTop
    // on every scroll even when scrollY was already > 300, causing
    // unnecessary re-renders.
    let ticking = false;
    let lastValue = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const newValue = window.scrollY > 300;
        if (newValue !== lastValue) {
          lastValue = newValue;
          setShowBackToTop(newValue);
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    triggerHaptic("selection");
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (window.__isAppDirty) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  /**
   * Shared "may I navigate away?" gate for both <Link> clicks and
   * programmatic navigation. Returns true when navigation may proceed.
   *
   * BUG FIX (dead click targets): the right-hand Discover rail used
   * `onClick={(e) => handleLinkClick(href, e)}` on plain <button>s, which
   * never called setLocation — so "Quick search", every Popular Topic,
   * every Suggested Network and every Active Contributor row did nothing
   * when clicked (~11 dead controls on desktop). handleLinkClick now
   * navigates itself; the <Link> path passes through the same gate.
   */
  const requestNavigation = (href: string, e?: React.MouseEvent): boolean => {
    triggerHaptic("selection");
    // Only block navigation if dirty AND the user is on a page with a
    // form (settings or wizard). This prevents the dirty flag from
    // blocking navigation on pages where it doesn't matter.
    if (window.__isAppDirty && (location === "/settings" || location === "/library")) {
      e?.preventDefault();
      setPendingHref(href);
      setIsConfirmOpen(true);
      return false;
    }
    return true;
  };

  const handleLinkClick = (href: string, e: React.MouseEvent) => {
    requestNavigation(href, e);
  };

  /** Programmatic navigation for button-driven targets (no anchor to swallow). */
  const navigate = (href: string) => {
    if (requestNavigation(href)) setLocation(href);
  };

  /**
   * Prefetch a route's lazy chunk on hover so navigation feels instant.
   * The route modules are already code-split (see App.tsx); calling the
   * same dynamic import the router uses warms the chunk into the browser
   * cache without actually navigating — when the user does click, the
   * chunk is already downloaded.
   */
  const routeChunkPrefetchers: Record<string, () => Promise<unknown>> = {
    "/": () => import("@/pages/HomeFeed"),
    "/search": () => import("@/pages/SearchPage"),
    "/library": () => import("@/pages/LibraryPage"),
    "/missions": () => import("@/pages/MissionsPage"),
    "/topics": () => import("@/pages/TopicsPage"),
    "/topics/:id": () => import("@/pages/TopicDetailPage"),
    "/community": () => import("@/pages/CommunityPage"),
    "/messages": () => import("@/pages/MessagesPage"),
    "/notifications": () => import("@/pages/NotificationsPage"),
    "/profile": () => import("@/pages/ProfilePage"),
    "/settings": () => import("@/pages/SettingsPage"),
  };
  const prefetchRoute = (href: string) => {
    const loader = routeChunkPrefetchers[href];
    if (loader) void loader().catch(() => { /* best-effort */ });
  };

  const handleConfirmNavigation = () => {
    window.__isAppDirty = false;
    setIsConfirmOpen(false);
    if (pendingHref) {
      setLocation(pendingHref);
    }
  };

  // Primary navigation — ordered by frequency of use so the most common
  // destinations are first (best for scanning, screen-reader order, and
  // thumb reach on mobile).
  const primaryNav = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/search", icon: Search, label: "Search" },
    { href: "/library", icon: Library, label: "Brains" },
    { href: "/missions", icon: Rocket, label: "Pathways" },
  ];

  // Secondary destinations — reachable from the desktop sidebar and the
  // mobile "More" sheet.
  const secondaryNav = [
    { href: "/topics", icon: Hash, label: "Topics" },
    { href: "/community", icon: Users, label: "Community" },
    { href: "/messages", icon: MessageSquare, label: "Messages" },
    { href: "/notifications", icon: Bell, label: "Notifications" },
  ];

  // Account destinations — pinned to the bottom of the desktop sidebar and
  // grouped separately in the mobile "More" sheet for clear separation.
  const accountNav = [
    { href: "/profile", icon: User, label: "Profile" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  // All items, in display order, used to render the desktop sidebar.

  // Mobile: 4 primary tabs + a "More" sheet containing everything else,
  // grouped by section.
  const bottomNavItems = primaryNav;
  const drawerSections = [
    { label: "Explore", items: secondaryNav },
    { label: "Account", items: accountNav },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>
      {/* Subtle Offline Corner Blue Dot Indicator */}
      {isOffline && (
        <div
          id="offline-corner-dot"
          role="status"
          aria-live="polite"
          aria-label="Offline mode active — Local first storage enabled"
          title="Offline mode active — your work is saved locally"
          className="fixed top-3 right-3 sm:top-4 sm:right-4 z-[100] flex items-center gap-2 px-2.5 py-1 rounded-full bg-background/90 backdrop-blur-md border border-blue-500/30 shadow-md shadow-blue-500/10 text-xs font-medium text-blue-500 animate-in fade-in zoom-in-90 select-none group cursor-default"
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500 shadow-sm shadow-blue-500/80" />
          </span>
          <span className="text-[11px] font-medium text-blue-500 hidden sm:inline-block tracking-tight">
            {pendingCount > 0 ? `Offline (${pendingCount} saved)` : "Offline"}
          </span>
        </div>
      )}
      {!isOffline && isSyncing && (
        <div
          role="status"
          className="fixed top-3 right-3 sm:top-4 sm:right-4 z-[100] flex items-center gap-2 px-3 py-1 bg-background/90 backdrop-blur-md border border-primary/30 text-primary rounded-full shadow-md text-[11px] font-semibold tracking-wide animate-in fade-in"
        >
          <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
          <span>Syncing...</span>
        </div>
      )}

      {/* Emotional Immersion: Ambient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20 dark:opacity-30 mix-blend-screen overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-500/20 blur-[150px] animate-pulse" style={{ animationDuration: '12s', animationDelay: '2s' }} />
      </div>
      
      <div className="flex min-h-screen w-full relative z-10">
        <ConnectionLoader />
      {/* Desktop Sidebar (Intact & Fixed on scroll like X) */}
      <TooltipProvider delayDuration={0}>
        <aside
          style={{ width: isSidebarCollapsed ? 72 : 240 }}
          className="hidden md:flex flex-col border-r border-border/50 bg-card/95 backdrop-blur-md sticky top-0 h-screen max-h-screen z-30 shrink-0 transition-[width] duration-200 ease-out select-none"
        >
          {/* Logo / Brand */}
          <div className="px-3 pt-3 pb-1">
            <Link
              href="/"
              onClick={(e) => handleLinkClick("/", e)}
              aria-label="Brain Drain — Home"
              className={cn(
                "flex items-center gap-2.5 font-extrabold text-xl tracking-tight cursor-pointer hover:bg-muted/60 p-2 rounded-full transition-all duration-200 overflow-hidden group",
                isSidebarCollapsed ? "w-10 h-10 justify-center mx-auto" : "w-auto inline-flex",
              )}
            >
              <BrainCircuit className="w-6 h-6 shrink-0 text-primary group-hover:scale-105 transition-transform" />
              {!isSidebarCollapsed && (
                <span className="truncate whitespace-nowrap bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent font-bold">
                  Brain Drain
                </span>
              )}
            </Link>
          </div>

          {/* FB-style Create launcher — every create action one click away.
              Collapsed sidebar shows the compact icon; expanded shows the
              full-width labelled button. */}
          <div className={cn("px-3 pt-1", isSidebarCollapsed && "flex justify-center")}>
            <CreateMenu variant={isSidebarCollapsed ? "compact" : "sidebar"} />
          </div>

          {/* Primary & Secondary Nav - Compact, Short & Intact */}
          <nav className="flex-1 px-2.5 py-1.5 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-none" aria-label="Primary">
            {[...primaryNav, ...secondaryNav].map((item) => {
              const isActive = isNavActive(item.href, location);
              const linkContent = (
                <Button
                  variant="ghost"
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "w-full transition-all duration-150 rounded-full h-10 text-sm font-medium",
                    isSidebarCollapsed ? "justify-center px-0 w-10 h-10 mx-auto" : "justify-start gap-3.5 px-3.5",
                    isActive ? "bg-foreground/10 text-foreground font-bold" : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                >
                  <item.icon className={cn("shrink-0", isSidebarCollapsed ? "w-5 h-5" : "w-4.5 h-4.5", isActive ? "stroke-[2.5]" : "stroke-[2]")} />
                  {!isSidebarCollapsed && <span className="truncate text-sm">{item.label}</span>}
                </Button>
              );

              return isSidebarCollapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link href={item.href} onClick={(e) => handleLinkClick(item.href, e)} onMouseEnter={() => prefetchRoute(item.href)} className="block w-full">{linkContent}</Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                <Link key={item.href} href={item.href} onClick={(e) => handleLinkClick(item.href, e)} onMouseEnter={() => prefetchRoute(item.href)} className="block w-full">{linkContent}</Link>
              );
            })}
          </nav>

          {/* Account links pinned to the bottom - Compact and Short */}
          <nav className="px-2.5 pb-3 pt-1.5 space-y-1 border-t border-border/40" aria-label="Account">
            {accountNav.map((item) => {
              const isActive = isNavActive(item.href, location);
              const linkContent = (
                <Button
                  variant="ghost"
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "w-full transition-all duration-150 rounded-full h-9 text-xs font-medium",
                    isSidebarCollapsed ? "justify-center px-0 w-10 h-9 mx-auto" : "justify-start gap-3.5 px-3.5",
                    isActive ? "bg-foreground/10 text-foreground font-bold" : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                >
                  <item.icon className={cn("shrink-0 w-4 h-4", isActive && "stroke-[2.5]")} />
                  {!isSidebarCollapsed && <span className="truncate text-xs">{item.label}</span>}
                </Button>
              );
              return isSidebarCollapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link href={item.href} onClick={(e) => handleLinkClick(item.href, e)} onMouseEnter={() => prefetchRoute(item.href)} className="block w-full">{linkContent}</Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                <Link key={item.href} href={item.href} onClick={(e) => handleLinkClick(item.href, e)} onMouseEnter={() => prefetchRoute(item.href)} className="block w-full">{linkContent}</Link>
              );
            })}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              aria-label={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              aria-expanded={!isSidebarCollapsed}
              className={cn(
                "mt-0.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted/60 h-9",
                isSidebarCollapsed ? "w-10 h-9 mx-auto flex items-center justify-center" : "w-full justify-start gap-3.5 px-3.5",
              )}
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              {!isSidebarCollapsed && <span className="text-xs font-medium">Collapse</span>}
            </Button>
          </nav>
        </aside>
      </TooltipProvider>

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col min-w-0 bg-background overflow-x-hidden outline-none pt-[env(safe-area-inset-top)] pb-[calc(5rem+env(safe-area-inset-bottom))] md:pt-0 md:pb-0">
        <SyncAttentionNotice count={deadLetterCount} />
        {/* Mobile Top Bar — phone-only header with logo + create button.
            Desktop has its own sidebar; this gives phone users a recognizable
            top bar and pushes content below the iOS notch / Dynamic Island
            via the safe-area padding on <main>. */}
        <div className="md:hidden sticky top-[env(safe-area-inset-top)] z-30 bg-background/90 backdrop-blur-xl border-b border-border/40 px-4 h-14 flex items-center justify-between">
          <Link
            href="/"
            onClick={(e) => handleLinkClick("/", e)}
            className="flex items-center gap-2 font-bold text-foreground"
            aria-label="Brain Drain home"
          >
            <Brain className="h-5 w-5 text-primary" aria-hidden />
            <span className="text-base tracking-tight">Brain Drain</span>
          </Link>
          <div className="flex items-center gap-1">
            <CreateMenu variant="compact" placement="bottom" />
          </div>
        </div>

        {/* Easy Back Navigation row (Only shown when deeply nested) */}
        {((location.startsWith("/topics/") && location !== "/topics") || (location.startsWith("/missions/") && location !== "/missions")) && (
          <header className="sticky top-0 z-20 w-full bg-background/80 backdrop-blur-md border-b border-border/40 py-2 px-4 flex items-center h-14">
            <Link 
              href={location.startsWith("/topics/") ? "/topics" : "/missions"} 
              onClick={(e) => handleLinkClick(location.startsWith("/topics/") ? "/topics" : "/missions", e)}
            >
              <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" />
                <span>Back to {location.startsWith("/topics/") ? "Topics" : "Missions"}</span>
              </Button>
            </Link>
          </header>
        )}

        <div className="flex-1 relative">
          <div className="h-full">
            {children}
          </div>
        </div>
      </main>

      {/* Desktop Right Sidebar (Extra features distributed for large screens) */}
      <aside aria-label="Discover" className="hidden xl:flex w-80 flex-col border-l border-border/50 bg-background sticky top-0 h-screen z-10 p-5 overflow-y-auto gap-5">
        {/* Quick Search Shortcut Launcher */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic("selection");
            // PHASE 3: open the command palette in place (search across
            // brains/topics/pages) instead of dumping the user on an empty
            // search page. The "/" and ⌘K shortcuts do the same.
            window.dispatchEvent(new CustomEvent("bd:open-palette"));
          }}
          aria-keyshortcuts="Control+K Meta+K /"
          aria-label="Quick search — Command K"
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-full bg-card/60 hover:bg-card border border-border/50 hover:border-border text-muted-foreground hover:text-foreground text-xs transition-all shadow-none group cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="font-medium">Quick search...</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-muted border border-border/40 text-muted-foreground group-hover:text-foreground">⌘K</kbd>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-muted border border-border/40 text-muted-foreground group-hover:text-foreground">/</kbd>
          </div>
        </button>

        <div className="space-y-5">
          <div className="bg-card/40 border border-border/40 p-4 rounded-[16px] space-y-4 hover:border-border/60 transition-colors">
            <h3 className="text-sm font-bold text-foreground tracking-tight">Popular Topics</h3>
            <div className="space-y-3">
              {[
                { name: "MachineLearning", count: "12.5k" },
                { name: "ReactPatterns", count: "8.2k" },
                { name: "SystemDesign", count: "6.1k" },
                { name: "GraphDatabases", count: "4.3k" },
              ].map((topic) => (
                <button
                  key={topic.name}
                  onClick={() => navigate(`/search?q=${encodeURIComponent(topic.name)}`)}
                  className="w-full text-left flex flex-col cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/40 p-2.5 -mx-2.5 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
                >
                  <span className="text-[11px] text-muted-foreground font-medium">Popular</span>
                  <span className="text-sm font-semibold text-foreground">#{topic.name}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">{topic.count} posts</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card/40 border border-border/40 p-4 rounded-[16px] space-y-4 hover:border-border/60 transition-colors">
            <h3 className="text-sm font-bold text-foreground tracking-tight">Suggested Networks</h3>
            <div className="space-y-3">
              {[
                { title: "Advanced TypeScript", author: "@alice_dev", color: "text-blue-500", bg: "bg-blue-500/10" },
                { title: "Node.js Microservices", author: "@bob_builder", color: "text-emerald-500", bg: "bg-emerald-500/10" },
                { title: "Quantum Computing", author: "@physics_fan", color: "text-purple-500", bg: "bg-purple-500/10" },
              ].map((brain, i) => (
                <button
                  key={i}
                  onClick={() => navigate("/library")}
                  className="w-full text-left flex items-center gap-3 cursor-pointer group hover:bg-muted/40 focus-visible:bg-muted/40 p-2 -mx-2 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
                >
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0", brain.bg, brain.color)}>
                    <BrainCircuit className="w-5 h-5" aria-hidden />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="text-sm font-semibold truncate group-hover:text-primary text-foreground">{brain.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{brain.author}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          
          <div className="bg-card/40 border border-border/40 p-4 rounded-[16px] space-y-4 hover:border-border/60 transition-colors">
            <h3 className="text-sm font-bold text-foreground tracking-tight">Active Contributors</h3>
            <div className="space-y-3">
              {[
                { name: "Sarah Connor", status: "online", role: "AI Researcher" },
                { name: "John Smith", status: "offline", role: "Frontend Lead" },
                { name: "Emma Watson", status: "online", role: "Data Scientist" },
              ].map((user, i) => (
                <button
                  key={i}
                  onClick={() => navigate(`/search?q=${encodeURIComponent(user.name)}`)}
                  className="w-full text-left flex items-center gap-3 cursor-pointer group hover:bg-muted/40 focus-visible:bg-muted/40 p-2 -mx-2 rounded-xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
                >
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                      <User className="w-5 h-5 text-muted-foreground" aria-hidden />
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="text-sm font-semibold truncate group-hover:text-primary text-foreground">{user.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{user.role}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Nav — primary destinations within thumb reach like Threads / X */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 h-[calc(3.5rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-background/90 backdrop-blur-xl border-t border-border/40 flex items-stretch justify-around px-2 z-50"
        aria-label="Primary"
      >
        {bottomNavItems.map((item) => {
          const isActive = isNavActive(item.href, location);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => handleLinkClick(item.href, e)}
              onTouchStart={() => prefetchRoute(item.href)}
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
              className="relative min-w-0 flex-1 flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <div
                className={cn(
                  "flex flex-col items-center gap-0.5 px-1 py-1 transition-colors duration-100",
                  isActive
                    ? "text-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "stroke-[2.5]" : "stroke-[1.75]")} aria-hidden />
                <span className="text-[10px] tracking-tight">{item.label}</span>
              </div>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setIsMobileDrawerOpen(true)}
          aria-label="Open more navigation options"
          aria-haspopup="dialog"
          aria-expanded={isMobileDrawerOpen}
          className={cn("relative min-w-0 flex-1 flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", drawerSections.some(section => section.items.some(item => isNavActive(item.href, location))) ? "text-foreground font-bold" : "text-muted-foreground hover:text-foreground")}
        >
          <div className="flex flex-col items-center gap-0.5 px-1 py-1 transition-colors duration-100">
            <MoreHorizontal className="w-5 h-5 stroke-[1.75]" aria-hidden />
            <span className="text-[10px] tracking-tight">More</span>
          </div>
        </button>
        <div className="flex shrink-0 items-center justify-center pl-1">
          <CreateMenu variant="compact" />
        </div>
      </nav>

      {/* Back to Top floating action for effortless navigation */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          aria-label="Scroll back to top"
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-8 right-4 z-40 p-2.5 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-center animate-in fade-in zoom-in-90"
        >
          <ArrowUp className="w-4 h-4 stroke-[2.5]" />
        </button>
      )}

      {/* Mobile More drawer (lazy-loaded to keep framer-motion off the critical path) */}
      <Suspense fallback={null}>
        <MobileNavDrawer
          open={isMobileDrawerOpen}
          onClose={closeMobileDrawer}
          sections={drawerSections}
          currentPath={location}
          onLinkClick={handleLinkClick}
        />
      </Suspense>

      {/* Navigation Interruption / Unsaved Edits Dialog (lazy radix chunk).
          Mounted only once the gate has actually fired, so the chunk is
          fetched on demand instead of on first paint. */}
      {isConfirmOpen && (
        <Suspense fallback={null}>
          <UnsavedChangesDialog
            open={isConfirmOpen}
            onOpenChange={setIsConfirmOpen}
            onDiscard={handleConfirmNavigation}
          />
        </Suspense>
      )}
      </div>
    </div>
  );
}
