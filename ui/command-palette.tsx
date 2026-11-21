import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Search,
  BrainCircuit,
  Hash,
  CornerDownLeft,
  Home,
  Library,
  Compass,
  Users,
  Settings,
  Rocket,
  MessageSquare,
  Bell,
} from "lucide-react";
import { useDatabase } from "@/hooks/use-database";
import { useTopics } from "@/hooks/use-topics";
import { cn } from "@/lib/utils";

/**
 * CommandPalette — ⌘K / "/" instant search across brains, topics and routes.
 *
 * PHASE 3 (competitive edge): Reddit/Quora make you navigate to a search page,
 * pick a tab, then scroll. Here the whole workspace is one keystroke away and
 * everything is filterable inline, keyboard-first:
 *   ↑/↓ move · Enter open · Esc close · type to filter
 *
 * Loaded lazily (see AppShell) so it never touches the first-paint bundle, and
 * it reads from the already-cached TanStack queries — opening it is instant
 * and works fully offline for brains/topics stored in IndexedDB.
 */
interface Item {
  id: string;
  kind: "brain" | "topic" | "route";
  label: string;
  hint?: string;
  href?: string;
  onSelect?: () => void;
}

const ROUTES: Array<{ label: string; href: string; icon: typeof Home }> = [
  { label: "Home feed", href: "/", icon: Home },
  { label: "Brains library", href: "/library", icon: Library },
  { label: "Topics", href: "/topics", icon: Compass },
  { label: "Pathways", href: "/missions", icon: Rocket },
  { label: "Community", href: "/community", icon: Users },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Settings", href: "/settings", icon: Settings },
];

/** Tiny subsequence matcher — "lpt" matches "Laptop buying guide". */
export function fuzzyMatch(needle: string, haystack: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  const h = haystack.toLowerCase();
  if (h.includes(n)) return true;
  let i = 0;
  for (const ch of h) {
    if (ch === n[i]) i++;
    if (i === n.length) return true;
  }
  return false;
}

export function CommandPalette({
  open,
  onOpenChange,
  onOpenBrain,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when a brain is chosen (the library opens its drawer). */
  onOpenBrain?: (brainId: string) => void;
}) {
  const [, setLocation] = useLocation();
  const { brains } = useDatabase();
  const { topics } = useTopics();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo<Item[]>(() => {
    const brainItems: Item[] = brains.map((b) => ({
      id: `brain:${b.id}`,
      kind: "brain",
      label: b.title || "Untitled brain",
      hint: b.category || (b.repo_status === "public_repo" ? "Published" : "Private"),
      onSelect: () => {
        if (onOpenBrain) onOpenBrain(b.id);
        else setLocation("/library");
      },
    }));
    const topicItems: Item[] = topics.map((t) => ({
      id: `topic:${t.id}`,
      kind: "topic",
      label: `#${t.name}`,
      hint: t.description,
      href: `/topics/${t.id}`,
    }));
    const routeItems: Item[] = ROUTES.map((r) => ({
      id: `route:${r.href}`,
      kind: "route",
      label: r.label,
      href: r.href,
    }));
    return [...brainItems, ...topicItems, ...routeItems];
  }, [brains, topics, onOpenBrain, setLocation]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) {
      // No query: show the most useful destinations, not a wall of everything.
      return items.filter((i) => i.kind !== "brain").slice(0, 12);
    }
    return items.filter((i) => fuzzyMatch(q, `${i.label} ${i.hint ?? ""}`)).slice(0, 30);
  }, [items, query]);

  // NOTE: no setState-in-effect resets. Typing resets the cursor in the
  // input's onChange and closing resets the query in `close()` — doing the
  // same work from effects caused a second render pass on every keystroke.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [open]);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const close = () => {
    setQuery("");
    setActiveIndex(0);
    onOpenChange(false);
  };

  const choose = (item: Item | undefined) => {
    if (!item) return;
    close();
    if (item.onSelect) item.onSelect();
    else if (item.href) setLocation(item.href);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Quick search"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-[16px] border border-border/60 bg-card shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(filtered[activeIndex]);
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-border/50 px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search brains, topics, pages…"
            aria-label="Search brains, topics and pages"
            aria-controls="command-palette-results"
            aria-activedescendant={filtered[activeIndex] ? `cmd-${filtered[activeIndex].id}` : undefined}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
            ESC
          </kbd>
        </div>

        <div ref={listRef} id="command-palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing matches “{query}”.
            </p>
          ) : (
            filtered.map((item, index) => {
              const Icon = item.kind === "brain" ? BrainCircuit : item.kind === "topic" ? Hash : Compass;
              const isActive = index === activeIndex;
              return (
                <button
                  key={item.id}
                  id={`cmd-${item.id}`}
                  data-index={index}
                  role="option"
                  aria-selected={isActive}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(item)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-sm transition-colors",
                    isActive ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && (
                    <span className="hidden max-w-[40%] truncate text-[11px] text-muted-foreground sm:block">{item.hint}</span>
                  )}
                  {isActive && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span className="ml-auto">{brains.length} brains · {topics.length} topics</span>
        </div>
      </div>
    </div>
  );
}
