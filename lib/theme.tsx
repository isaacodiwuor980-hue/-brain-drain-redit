import { createContext, useContext, useEffect, useMemo, useState } from "react";

// Theme values:
// - "light"        — forced light mode.
// - "dark"         — forced dark mode.
// - "system"       — follows the OS prefers-color-scheme (dark/light only).
// - "dynamic"      — like "system" but ALSO attempts to adopt the OS accent
//                    colour (Windows/Android Chrome expose it via the meta
//                    theme-color; macOS Safari exposes it via the system
//                    accent). We fall back to the default primary if no OS
//                    accent is available, so "dynamic" is a strict superset
//                    of "system" — it never looks worse, only more native.
export type Theme = "dark" | "light" | "system" | "dynamic";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

const VALID_THEMES: ReadonlyArray<Theme> = ["dark", "light", "system", "dynamic"];

/**
 * Read a stored theme value from localStorage while tolerating environments
 * where localStorage is unavailable or blocked (Safari private mode, sandboxed
 * iframes, SSR). Returns null on any failure so the caller can fall back to
 * the default theme.
 */
function readStoredTheme(storageKey: string): Theme | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (value && (VALID_THEMES as ReadonlyArray<string>).includes(value)) {
      return value as Theme;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredTheme(storageKey: string, theme: Theme): void {
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // Ignore write failures (private mode, quota exceeded). The theme will
    // still apply for the current session; it just won't persist.
  }
}

function resolveSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * The developer-set theme-color in index.html. We must NOT consume this as an
 * "OS accent" — it's a static value the developer chose for browser chrome
 * (the mobile address bar tint). Treating it as the OS accent (the previous
 * implementation) overrode `--primary` with near-black and made primary
 * buttons unreadable in light mode.
 */
const DEVELOPER_THEME_COLOR = "#101010";

/**
 * Try to read the OS accent colour from the environment. We deliberately do
 * NOT read the developer-set <meta name="theme-color"> (it's a static value,
 * not the OS accent) — instead we look for a high-entropy User-Agent Client
 * Hint, which Chromium exposes on Android / ChromeOS / Windows when the user
 * has chosen a system accent colour. This is best-effort: if no accent is
 * available we return null and "dynamic" theme degrades gracefully to the
 * standard "system" behavior (dark/light per OS).
 */
async function readOsAccent(): Promise<string | null> {
  // 1. High-entropy User-Agent Client Hints (Chromium only). The hint is
  // gated behind a Permissions Policy; calling getHighEntropyValues is the
  // standard way to opt-in. Returns null on non-supporting browsers.
  try {
    const uaData = navigator.userAgentData;
    if (uaData && typeof uaData.getHighEntropyValues === "function") {
      const hv = await uaData.getHighEntropyValues(["accentColor"]);
      const accent = hv?.accentColor;
      if (typeof accent === "string" && accent && accent.toLowerCase() !== "default") {
        // Validate it parses as a CSS colour before returning.
        const probe = new Option().style;
        probe.color = accent;
        if (probe.color !== "") return accent;
      }
    }
  } catch {
    // User-Agent Client Hints not available — fall through.
  }

  // 2. Some Windows / macOS Chromium builds also expose the accent via a
  // <meta name="msapplication-navbutton-color">. Treat it the same way as
  // the User-Agent hint — but ONLY if it differs from the developer-set
  // default value (otherwise we'd be reading our own static value back).
  try {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="msapplication-navbutton-color"]');
    if (meta?.content && meta.content.toLowerCase() !== DEVELOPER_THEME_COLOR.toLowerCase()) {
      const probe = new Option().style;
      probe.color = meta.content;
      if (probe.color !== "") return meta.content;
    }
  } catch {
    // ignore — feature-detection failed.
  }

  return null;
}

/**
 * Apply the OS accent to the document's `--primary` CSS variable. We express
 * it in HSL space because that's what the rest of the app's tokens use.
 *
 * NOTE: `readOsAccent` is async because the User-Agent Client Hint API is
 * async. We don't await it inside the theme effect; instead we kick off the
 * async work and apply the override when it resolves. A subsequent theme
 * change will `clearOsAccent` synchronously so there's no race where the
 * override leaks into the next theme.
 */
async function applyOsAccent(): Promise<void> {
  const accent = await readOsAccent();
  if (!accent) return;
  // Convert any CSS colour string to HSL components. We use a hidden
  // element + getComputedStyle to leverage the browser's parser.
  try {
    const probe = document.createElement("div");
    probe.style.color = accent;
    probe.style.display = "none";
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    document.body.removeChild(probe);
    const m = rgb.match(/rgba?\(([^)]+)\)/i);
    if (!m) return;
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    if (parts.length < 3) return;
    const [r, g, b] = parts.map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    document.documentElement.style.setProperty("--primary", `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`);
  } catch {
    // Best-effort — if conversion fails we just leave the default primary.
  }
}

function clearOsAccent(): void {
  document.documentElement.style.removeProperty("--primary");
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => readStoredTheme(storageKey) ?? defaultTheme
  );

  // Apply the resolved theme class + (for "dynamic") the OS accent override.
  // The accent lookup is async (User-Agent Client Hints), so we use a
  // cancelled flag to ensure a stale async result from a previous theme
  // doesn't leak into the current one.
  useEffect(() => {
    let cancelled = false;
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system" || theme === "dynamic") {
      root.classList.add(resolveSystemTheme());
    } else {
      root.classList.add(theme);
    }

    if (theme === "dynamic") {
      // Fire-and-forget; the cancelled flag + cleanup guarantee no stale
      // override leaks into the next theme.
      void applyOsAccent().then(() => {
        if (cancelled) {
          // The theme changed while we were loading the accent — undo
          // whatever applyOsAccent just set so the next theme starts clean.
          clearOsAccent();
        }
      });
    } else {
      clearOsAccent();
    }
    return () => {
      cancelled = true;
      // Always clear on cleanup so the next theme doesn't inherit the
      // previous dynamic override while the new accent loads.
      clearOsAccent();
    };
  }, [theme]);

  // React to OS color-scheme changes while in "system" or "dynamic" mode.
  useEffect(() => {
    if (theme !== "system" && theme !== "dynamic") return undefined;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const root = window.document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(resolveSystemTheme());
      if (theme === "dynamic") applyOsAccent();
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const value = useMemo<ThemeProviderState>(() => ({
    theme,
    setTheme: (next: Theme) => {
      writeStoredTheme(storageKey, next);
      setThemeState(next);
    },
  }), [theme, storageKey]);

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
