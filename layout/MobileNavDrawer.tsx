import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isNavActive } from "@/lib/navigation";

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  sections: NavSection[];
  currentPath: string;
  onLinkClick: (href: string, e: React.MouseEvent) => void;
}

/**
 * Mobile "More" bottom sheet. Items are grouped into clearly-labeled
 * sections (Explore / Account) so settings and profile aren't mixed in with
 * primary navigation.
 */
export function MobileNavDrawer({
  open,
  onClose,
  sections,
  currentPath,
  onLinkClick,
}: MobileNavDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  /**
   * BUG FIX (drawer was a keyboard trap-ish dead end): the sheet had
   * aria-modal="true" but never handled Escape, never locked background
   * scrolling (the feed scrolled underneath the sheet on iOS), and never
   * moved focus into the panel — so keyboard/screen-reader users could
   * tab into the page behind the overlay. Now: Escape closes, body scroll
   * is locked while open, focus lands on the close button, and focus is
   * restored to the trigger on unmount/close.
   */
  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // rAF so the spring animation's first frame doesn't eat the focus call.
    const focusTimer = setTimeout(() => closeButtonRef.current?.focus(), 60);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      // Minimal focus containment: cycle Tab within the panel.
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="md:hidden fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            className="md:hidden fixed bottom-0 left-0 right-0 z-[70] bg-card rounded-t-3xl border-t border-border/50 p-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
          >
                        <div className="mx-auto w-10 h-1.5 rounded-full bg-muted-foreground/30 mb-6" aria-hidden="true" />
            <div className="flex items-center justify-between mb-4">
              <span className="font-bold text-lg">More</span>
              <Button
                ref={closeButtonRef}
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Close menu"
                onClick={onClose}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-6">
              {sections.map((section) => (
                <nav key={section.label} aria-label={section.label}>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-2">
                    {section.label}
                  </h2>
                  <div className="grid grid-cols-2 min-[360px]:grid-cols-3 gap-2 sm:gap-3">
                    {section.items.map((item) => {
                      const isActive = isNavActive(item.href, currentPath);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={(e) => {
                            onLinkClick(item.href, e);
                            onClose();
                          }}
                          aria-current={isActive ? "page" : undefined}
                          className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[16px]"
                        >
                          <div
                            className={cn(
                              "flex flex-col items-center gap-2 p-4 rounded-[16px] border transition-all duration-100 active:scale-[0.97] cursor-pointer touch-manipulation",
                              isActive
                                ? "bg-primary/10 border-primary/30 text-primary"
                                : "bg-muted/30 border-border/40 text-muted-foreground hover:text-foreground hover:bg-accent/50",
                            )}
                          >
                            <item.icon className="w-7 h-7" aria-hidden />
                            <span className="text-xs font-semibold text-center leading-tight">{item.label}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </nav>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
