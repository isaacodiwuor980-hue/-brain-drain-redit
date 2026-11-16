/**
 * CreateMenu — FB-style "+ Create" quick-action launcher.
 *
 * WHY: content creation was scattered across the app and buried in
 * page-specific corners (post composer only via the home feed's floating
 * button, New Brain only inside the Library toolbar, the Personality Test
 * only via a `hidden sm:flex` button on the Pathways page — invisible on
 * mobile). This puts every create action ONE click away from anywhere:
 *
 *   - New Post       → /?compose=1          (HomeFeed auto-opens the composer)
 *   - New Brain      → /library?create=brain (Dashboard auto-opens the wizard)
 *   - Personality Test → /personality-test
 *   - Find Friends   → / (contact-sync widgets live on the home feed)
 *
 * Rendered in the desktop sidebar (above the primary nav, like FB) and as
 * a compact slot in the mobile bottom bar.
 */
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, PencilLine, Brain, Sparkles, UserPlus } from "lucide-react";
import { triggerHaptic } from "@/lib/device";

interface CreateMenuProps {
  /**
   * "sidebar": full-width labelled button (desktop sidebar).
   * "compact": icon-only square button (mobile bottom bar slot).
   */
  variant?: "sidebar" | "compact";
}

export function CreateMenu({ variant = "sidebar" }: CreateMenuProps) {
  const [, setLocation] = useLocation();

  /**
   * Navigate to the target route AND broadcast a custom event. The event
   * handles the "already on that page" case (e.g. tapping New Post while on
   * the home feed) — wouter doesn't re-run effects for search-only changes
   * on an already-matched route, so a query param alone would be missed.
   * The mount-time query check in HomeFeed/Dashboard handles the "navigated
   * from another page" case. Both paths are idempotent (setOpen(true) twice
   * is harmless).
   */
  const go = (href: string, eventName?: string) => {
    triggerHaptic("selection");
    if (eventName) window.dispatchEvent(new CustomEvent(eventName));
    setLocation(href);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "sidebar" ? (
          <Button
            className="w-full h-10 rounded-full text-sm font-semibold gap-2 shadow-sm"
            aria-label="Create"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden />
            <span className="truncate">Create</span>
          </Button>
        ) : (
          <Button
            size="icon"
            className="w-10 h-10 rounded-full shadow-sm"
            aria-label="Create"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" aria-hidden />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Create
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go("/?compose=1", "bd:open-composer")} className="gap-3 cursor-pointer">
          <PencilLine className="w-4 h-4 text-primary" aria-hidden />
          <div className="flex flex-col">
            <span className="text-sm font-medium">New Post</span>
            <span className="text-xs text-muted-foreground">Share a thought, question, or answer</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("/library?create=brain", "bd:open-brain-wizard")} className="gap-3 cursor-pointer">
          <Brain className="w-4 h-4 text-primary" aria-hidden />
          <div className="flex flex-col">
            <span className="text-sm font-medium">New Brain</span>
            <span className="text-xs text-muted-foreground">Build a yes/no decision guide</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("/personality-test")} className="gap-3 cursor-pointer">
          <Sparkles className="w-4 h-4 text-primary" aria-hidden />
          <div className="flex flex-col">
            <span className="text-sm font-medium">Personality Test</span>
            <span className="text-xs text-muted-foreground">Discover your builder profile</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go("/")} className="gap-3 cursor-pointer">
          <UserPlus className="w-4 h-4 text-primary" aria-hidden />
          <div className="flex flex-col">
            <span className="text-sm font-medium">Find Friends</span>
            <span className="text-xs text-muted-foreground">Sync contacts and Gmail</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
