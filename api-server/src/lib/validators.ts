/**
 * api-server/src/lib/validators.ts — Shared request-param validators.
 *
 * Phase 4: extracts the UUID + slug regex checks duplicated across
 * experts.ts, mentors.ts, minds.ts, skills.ts, etc. Centralizing them
 * here means a future tightening (e.g. stricter UUID v4) only touches
 * one file.
 */

const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const SLUG_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Validate that a string is a UUID (with optional dashes). Returns the
 * trimmed string if valid, null if invalid. Use for :id params that go
 * into PostgREST `eq.` filters (prevents filter-injection).
 */
export function validateUuid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

/**
 * Validate that a string is a slug (alphanumeric + dash + underscore).
 * Returns the trimmed string if valid, null if invalid. Use for :id / :topic
 * params that go into PostgREST `eq.` filters.
 */
export function validateSlug(raw: unknown, maxLen = 120): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > maxLen) return null;
  return SLUG_RE.test(trimmed) ? trimmed : null;
}

/** Standard 400 response body for invalid params. */
export const INVALID_ID_BODY = { error: "Invalid id" } as const;
