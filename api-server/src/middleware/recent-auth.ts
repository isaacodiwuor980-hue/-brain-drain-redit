import type { NextFunction, Request, Response } from "express";

/**
 * For future reviewed sensitive routes only, after requireAuth. Uses the
 * signature-verified Firebase auth_time, never client headers or token iat.
 * Freshness is not revocation checking, MFA, ownership proof, authorization or
 * a substitute for Firebase session-revocation verification. Unwired by
 * default; the deletion and identity workflows are not implemented.
 */
export function requireRecentAuthentication(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth?.uid) { res.status(401).json({ error: "Authentication required" }); return; }
  const authTime = req.auth.authTime;
  const now = Math.floor(Date.now() / 1000);
  if (typeof authTime !== "number" || !Number.isSafeInteger(authTime) || authTime <= 0 || authTime > now || now - authTime > 300) {
    res.status(403).json({ error: "Recent sign-in required" });
    return;
  }
  next();
}
