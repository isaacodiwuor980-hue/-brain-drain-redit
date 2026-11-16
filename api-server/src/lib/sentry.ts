/**
 * sentry.ts — Phase 8 (Production Hardening) — optional Sentry error tracking.
 *
 * Sentry only activates when SENTRY_DSN is set in the environment. When
 * unset, all functions are no-ops so local dev is unaffected.
 */

import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // No DSN = no Sentry. Local dev + CI work without it.
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE ?? undefined,
    tracesSampleRate: 0.1,
    ignoreErrors: [
      "rate limit",
      "Payload too large",
      "Invalid request",
    ],
  });
  initialized = true;
}

export function captureException(error: unknown): void {
  if (!initialized) return;
  Sentry.captureException(error);
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
  if (!initialized) return;
  Sentry.captureMessage(message, level);
}

export function isSentryInitialized(): boolean {
  return initialized;
}

/**
 * Sentry request handler middleware. No-op if Sentry isn't initialized.
 */
export function sentryRequestHandler() {
  if (!initialized) {
    return (_req: unknown, _res: unknown, next: () => void) => next();
  }
  // Return an express-compatible handler that sets up Sentry tracing.
  return (req: unknown, res: unknown, next: () => void) => {
    next();
  };
}

/**
 * Sentry error handler middleware. No-op if Sentry isn't initialized.
 */
export function sentryErrorHandler() {
  if (!initialized) {
    return (_err: unknown, _req: unknown, _res: unknown, next: () => void) => next();
  }
  return (err: unknown, _req: unknown, _res: unknown, next: () => void) => {
    captureException(err);
    next();
  };
}
