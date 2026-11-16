import { useEffect } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/hooks/use-toast";

export function useShortcuts() {
  const [, setLocation] = useLocation();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  useEffect(() => {
    let keySequence = "";
    let timeout: NodeJS.Timeout;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Handle Command/Ctrl + K or / for instant search
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || e.key === "/") {
        e.preventDefault();
        setLocation("/search");
        return;
      }

      // Handle top scroll with 't'
      if (e.key.toLowerCase() === "t" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      // Handle Command/Ctrl + \ for theme toggle. Cycles through all four
      // themes so the user can always get back to "dynamic"/"system" — the
      // previous dark↔light-only toggle stranded users who'd chosen dynamic.
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
        e.preventDefault();
        const order = ["system", "dynamic", "dark", "light"] as const;
        const idx = order.indexOf(theme as typeof order[number]);
        const next = order[(idx + 1) % order.length] as typeof order[number];
        setTheme(next);
        toast({
          title: "Theme changed",
          description: `Switched to ${next} mode.`,
        });
        return;
      }

      // Navigation sequences
      keySequence += e.key.toLowerCase();
      
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        keySequence = "";
      }, 1000);

      const navMap: Record<string, string> = {
        "gh": "/",
        "gl": "/library",
        "gc": "/community",
        "gm": "/messages",
        "gp": "/profile",
        "gs": "/settings",
        "gn": "/notifications",
        "gf": "/missions"
      };

      if (keySequence === "?") {
        e.preventDefault();
        toast({
          title: "Keyboard Shortcuts",
          description: "Cmd/Ctrl+K: Search | Cmd/Ctrl+\\: Toggle Theme | g+[h/l/c/m/p/s/n/f]: Navigate | ?: Help",
          duration: 5000,
        });
        keySequence = "";
      } else if (navMap[keySequence]) {
        e.preventDefault();
        setLocation(navMap[keySequence]);
        keySequence = "";
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timeout);
    };
  }, [setLocation, theme, setTheme, toast]);
}
