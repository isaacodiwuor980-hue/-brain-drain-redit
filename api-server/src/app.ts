import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { config } from "./lib/config";
import { createRateLimiter } from "./lib/rate-limit";

const app: Express = express();

// S-1 fix: configure `trust proxy` so req.ip reflects the real client IP
// (validated from X-Forwarded-For) instead of the proxy's IP. This is what
// the rate limiter keys on. Default "false" = direct mode (req.ip =
// socket.remoteAddress, not spoofable). Set TRUST_PROXY=1 (or the number of
// trusted proxy hops) when deploying behind a reverse proxy.
// Express accepts: boolean, number (hop count), comma-separated CIDRs,
// "loopback", "linklocal", "uniquelocal". We parse the env string into the
// right type.
const tpRaw = config.trustProxy;
if (/^\d+$/.test(tpRaw)) {
  app.set("trust proxy", Number(tpRaw));
} else if (tpRaw === "true" || tpRaw === "false") {
  app.set("trust proxy", tpRaw === "true");
} else if (tpRaw) {
  app.set("trust proxy", tpRaw);
}

// Baseline security headers for all API responses.
// X-Frame-Options: ALLOWALL — needed because the space-z.ai preview
// environment embeds the app in an iframe on a different subdomain.
// The CSP frame-ancestors directive (set in server.ts) is the authoritative
// clickjacking control; this legacy header must not block legitimate iframes.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.removeHeader("X-Powered-By");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = config.corsOrigins;

/**
 * Match an origin against the allowed list. Supports exact match and
 * wildcard prefixes (e.g. "https://*.space-z.ai" matches any subdomain).
 */
function originAllowed(origin: string): boolean {
  for (const pattern of allowedOrigins) {
    if (pattern === origin) return true;
    // Wildcard: "https://*.example.com" matches "https://anything.example.com"
    if (pattern.includes("*.")) {
      // Build a regex: escape ALL regex metacharacters (including *), then
      // replace the escaped "\*\." with "[a-zA-Z0-9.-]+\.".
      const escaped = pattern.replace(/[.+?^${}()|[\]\\*]/g, "\\$&");
      const re = "^" + escaped.replace(/\\\*\\\./g, "[a-zA-Z0-9.-]+\\.") + "$";
      if (new RegExp(re).test(origin)) return true;
    }
  }
  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin / non-browser requests have no Origin header — allow.
      if (!origin) {
        callback(null, true);
        return;
      }
      // If the operator has not configured any allowed origins, default-deny
      // cross-origin browser requests.
      if (allowedOrigins.length === 0) {
        // callback(null, false) silently rejects (no CORS headers set,
        // browser blocks the request). callback(new Error(...)) would
        // trigger Express's error handler and return HTTP 500, which
        // leaks that the origin was rejected.
        callback(null, false);
        return;
      }
      if (originAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }),
);

// Cap request bodies to prevent abuse.
app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

// A stricter limiter for ingest/error endpoints, a more lenient one for reads.
const writeLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
});
const readLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max * 5,
});

app.use("/api/events", writeLimiter);
app.use("/api/client-errors", writeLimiter);
// B3 (stale-cache fix): without an explicit Cache-Control, browsers may
// heuristic-cache API GETs and serve them WITHOUT contacting the server —
// observed live: a personalized /api/feed?mode=following response was served
// from the HTTP cache even after the underlying data changed. API payloads
// are personalized and fast-changing; never let the browser cache them.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api", readLimiter);
app.use("/api", router);

// Centralized error handler (body size limits, CORS rejections, etc.).
app.use(
  (
    err: { status?: number; statusCode?: number; type?: string; message?: string } | null | undefined,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (res.headersSent) return;

    const status =
      err?.status ||
      err?.statusCode ||
      (err?.type === "entity.too.large" ? 413 : undefined) ||
      (err?.type === "entity.parse.failed" ? 400 : undefined);

    if (status && status < 500) {
      res.status(status).json({
        error:
          status === 413
            ? "Payload too large."
            : status === 400
              ? "Invalid request."
              : err?.message || "Bad request.",
      });
      return;
    }

    logger.error({ err }, "Request error");
    res.status(500).json({ error: "Internal server error" });
  },
);

app.disable("x-powered-by");

export default app;
