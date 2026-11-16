/**
 * api-server/src/lib/http-errors.ts — Shared error-handling helpers.
 *
 * Phase 4 (pragmatic layering): instead of a full controllers/services/
 * repositories refactor (over-engineering for a ~20-route app where the
 * route handlers ARE the controllers and lib/supabase.ts IS the repository),
 * we extract the two patterns duplicated across 37 sites in 13 route files:
 *
 *   1. SupabaseError → 502 mapping (upstream failure)
 *   2. throw → 500 mapping (unexpected error, logged)
 *
 * This keeps the route handlers thin and DRY without adding indirection.
 */
import type { Response } from "express";
import type { Logger } from "pino";
import { SupabaseError } from "./supabase";

/**
 * Handle a Supabase-route error consistently. Returns true if the error was
 * handled (response sent), false if the caller should re-throw.
 *
 * Usage in a route handler's catch block:
 *   try { ... } catch (error) {
 *     if (handleSupabaseError(res, error, req.log, "Feed query failed")) return;
 *     throw error;
 *   }
 *
 * The `throw error` fallback lets the centralized error handler in app.ts
 * turn truly unexpected errors into 500s with Sentry capture.
 */
export function handleSupabaseError(
  res: Response,
  error: unknown,
  log: Logger | undefined,
  context: string,
  clientMessage = "Storage unavailable",
): boolean {
  if (error instanceof SupabaseError) {
    log?.error?.({ err: error, status: error.status }, context);
    res.status(502).json({ error: clientMessage });
    return true;
  }
  return false;
}
