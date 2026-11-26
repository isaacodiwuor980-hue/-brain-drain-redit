/**
 * Frontend runtime configuration.
 *
 * Vite only exposes variables prefixed with VITE_ to the client bundle.
 * Everything is read once here and validated so misconfiguration surfaces
 * immediately instead of causing silent failures deep in the UI.
 */

function readString(name: string, fallback = ""): string {
  const value = import.meta.env[name];
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = import.meta.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function readNumber(name: string, fallback: number): number {
  const raw = import.meta.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBaseUrl(url: string): string {
  if (!url) return "";
  return url.replace(/\/+$/, "");
}

/**
 * True when the app should talk to the backend API.
 *
 * CRITICAL SEMANTICS: an EMPTY VITE_API_BASE_URL means SAME-ORIGIN, not "no
 * API". The production deployment serves the SPA and /api/* from the same
 * host (see api-client.ts buildUrl — `` `${""}/api/feed` `` → "/api/feed"),
 * so an empty base URL is the normal, fully-cloud-connected configuration.
 *
 * The old `if (!env.apiBaseUrl)` guards in the data hooks misread "empty" as
 * "local-only" and silently skipped every API call — the home feed fell back
 * to an empty IndexedDB cache on fresh devices and never showed server posts.
 *
 * To build a genuinely offline/local-only bundle, set VITE_LOCAL_ONLY=1.
 */
const localOnly = readBoolean("VITE_LOCAL_ONLY", false);

export const env = {
  /** Public Firebase web config is loaded from firebase-applet-config.json. */
  appName: "MindSpool",
  apiBaseUrl: normalizeBaseUrl(readString("VITE_API_BASE_URL")),
  /** Whether cloud API calls are attempted at all. Empty base URL = same-origin = enabled. */
  apiEnabled: !localOnly,
  apiTimeoutMs: readNumber("VITE_API_TIMEOUT", 15_000),
  features: {
    analytics: readBoolean("VITE_ENABLE_ANALYTICS", true),
    notifications: readBoolean("VITE_ENABLE_NOTIFICATIONS", true),
    social: readBoolean("VITE_ENABLE_SOCIAL_FEATURES", true),
  },
  performance: {
    cacheDurationMs: readNumber("VITE_CACHE_DURATION", 300_000),
    prefetchDelayMs: readNumber("VITE_PREFETCH_DELAY", 1_000),
  },
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;

export type AppEnv = typeof env;
