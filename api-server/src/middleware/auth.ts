import type { NextFunction, Request, Response } from "express";
import { extractBearerToken, verifyFirebaseToken, type VerifiedAuth } from "../lib/firebase-auth";
import { logger } from "../lib/logger";

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: VerifiedAuth;
    }
  }
}

/**
 * Classify an auth error so the middleware can return the right status.
 * - "missing"/"malformed"/"invalid-signature"/"expired"/"bad-claims" → 401
 *   (the client sent a bad token; don't retry without a new token)
 * - "network"/"upstream" → 502 (JWKS endpoint unreachable; client may retry)
 * - "config" → 500 (server misconfiguration, e.g. FIREBASE_PROJECT_ID unset)
 *
 * B-12 fix: previously every error collapsed into 401, which (a) masked
 * upstream outages from operators (logs showed 401s, not 502s) and (b)
 * caused clients to invalidate valid sessions and force re-login when the
 * real problem was a transient JWKS fetch failure.
 */
function classifyAuthError(err: unknown): "auth" | "upstream" | "config" {
  const msg = err instanceof Error ? err.message : String(err);
  // Upstream: JWKS fetch failed, network error, Google returned non-200.
  if (/Failed to fetch Firebase public keys|fetch|network/i.test(msg)) return "upstream";
  // Config: project ID unset, algorithm unsupported.
  if (/Firebase project ID is not configured|Unsupported token algorithm/i.test(msg)) return "config";
  // Everything else is a client-side auth problem.
  return "auth";
}

/**
 * Requires a valid Firebase ID token. Responds 401 when missing or invalid,
 * 502 when the JWKS endpoint is unreachable, 500 on server misconfiguration.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = extractBearerToken(req.headers.authorization);
  try {
    req.auth = await verifyFirebaseToken(token);
    next();
  } catch (err) {
    const kind = classifyAuthError(err);
    if (kind === "upstream") {
      logger.warn({ err }, "Auth verification failed — upstream JWKS unavailable");
      res.status(502).json({ error: "Authentication service temporarily unavailable" });
      return;
    }
    if (kind === "config") {
      logger.error({ err }, "Auth verification failed — server misconfiguration");
      res.status(500).json({ error: "Authentication misconfigured" });
      return;
    }
    res.status(401).json({ error: "Authentication required" });
  }
}

/**
 * Attaches the authenticated user if a valid token is present, but allows
 * anonymous/guest access otherwise. Use for public read endpoints that can
 * personalize responses when a user is signed in.
 *
 * Upstream JWKS failures are logged but never block the request (the caller
 * just proceeds as a guest) — this is intentional, since these endpoints
 * work without auth anyway.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const token = extractBearerToken(req.headers.authorization);
  if (token) {
    try {
      req.auth = await verifyFirebaseToken(token);
    } catch (err) {
      // Log upstream failures so operators see JWKS outages, but don't
      // block the request (the caller proceeds as a guest).
      const kind = classifyAuthError(err);
      if (kind !== "auth") {
        logger.warn({ err, kind }, "Optional auth verification failed — proceeding as guest");
      }
      // Ignore invalid tokens for optional auth; the request proceeds as guest.
    }
  }
  next();
}
