/**
 * Centralized, validated server configuration. Reads environment variables
 * once at startup so misconfiguration fails loudly instead of causing silent
 * runtime bugs.
 */

function readString(name: string, fallback?: string): string {
  const value = process.env[name];
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (fallback !== undefined) return fallback;
  return "";
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer for ${name}: ${raw}`);
  }
  return Math.round(parsed);
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function readList(name: string, fallback: string[] = []): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

// B-10 fix: previously config.ts threw at import-time when PORT was unset,
// which crashed the server before server.ts's documented 3000 fallback could
// run (server.ts has its own fallback, but it imports apiApp → config.ts
// eagerly, so the throw won). Now we mirror server.ts's fallback here so
// `node dist/server.cjs` works without an explicit PORT env var. PaaS
// deploys that inject PORT=8080 etc. still override the fallback.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;
if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

export const config = {
  port,
  nodeEnv: readString("NODE_ENV", "development"),
  isProduction: readString("NODE_ENV", "development") === "production",
  logLevel: readString("LOG_LEVEL", "info"),
  corsOrigins: readList("CORS_ORIGIN"),
  bodyLimit: readString("BODY_LIMIT", "256kb"),
  // S-1 fix: Express `trust proxy` setting. Behind a reverse proxy (Render,
  // Railway, Fly, nginx, Cloud Run), set TRUST_PROXY_HOPS to the number of
  // trusted hops between the client and your server (usually 1). This makes
  // req.ip reflect the real client IP (from X-Forwarded-For, validated)
  // instead of the proxy's IP, which is what the rate limiter must key on.
  // Values: number of hops (1, 2, ...), "loopback", "linklocal", "uniquelocal",
  // or any Express-accepted value. Default false (do not trust — direct mode).
  trustProxy: readString("TRUST_PROXY", "false"),
  rateLimit: {
    windowMs: readInt("RATE_LIMIT_WINDOW_MS", 60_000),
    max: readInt("RATE_LIMIT_MAX", 60),
  },
  // When set, the rate limiter uses Redis (shared across instances) with an
  // in-memory fallback if Redis is unreachable. Unset → per-instance memory.
  redis: {
    url: readString("REDIS_URL"),
  },
  supabase: {
    url: readString("SUPABASE_URL"),
    serviceRoleKey: readString("SUPABASE_SERVICE_ROLE_KEY"),
    analyticsTable: readString("SUPABASE_ANALYTICS_TABLE", "analytics_events"),
    timeoutMs: readInt("SUPABASE_REQUEST_TIMEOUT_MS", 2500),
    get isConfigured() {
      return Boolean(this.url && this.serviceRoleKey);
    },
  },
  analytics: {
    disableSupabase: readBoolean("ANALYTICS_DISABLE_SUPABASE", false),
    disableFileStorage: readBoolean("ANALYTICS_DISABLE_FILE_STORAGE", false),
    eventsFile: readString("ANALYTICS_EVENTS_FILE"),
  },
  firebase: {
    projectId: readString("FIREBASE_PROJECT_ID"),
  },
} as const;

export type Config = typeof config;
