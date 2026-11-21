/**
 * Minimal Supabase PostgREST client using fetch and the service-role key.
 * The API server is the only component that talks to Supabase directly;
 * the browser never sees the service-role key.
 */

import { config } from "./config";

export class SupabaseError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "SupabaseError";
    this.status = status;
    this.body = body;
  }
}

function baseUrl(): string {
  return `${config.supabase.url.replace(/\/+$/, "")}/rest/v1`;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: config.supabase.serviceRoleKey,
    Authorization: `Bearer ${config.supabase.serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/**
 * Default per-request timeout for Supabase REST calls. Without this, a slow
 * or unresponsive Supabase hangs the request INDEFINITELY — the feed would
 * spin forever and the UI would feel frozen (the user reported exactly this:
 * "the UI is unresponsive"). On timeout we throw a SupabaseError (status 0)
 * so route handlers treat it like any other DB failure (feed.ts → 502,
 * surfaced to the UI as a retryable feed failure). Verified 2026-11-14.
 */
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * fetch wrapper that aborts after `timeoutMs` and chains any caller-provided
 * AbortSignal. Distinguishes a timeout abort (→ SupabaseError) from a caller
 * abort (re-thrown as-is so the caller's own cancellation logic works).
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit & { signal?: AbortSignal },
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    // Only convert to SupabaseError when WE timed out (not when the caller
    // aborted). Caller abort re-throws so request cancellation stays clean.
    const weTimedOut = controller.signal.aborted && (!externalSignal || !externalSignal.aborted);
    if (weTimedOut) {
      throw new SupabaseError(`Supabase request timed out after ${timeoutMs}ms`, 0, "timeout");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

interface QueryOptions {
  select?: string;
  filters?: Record<string, string | number | boolean | null>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  /** e.g. "exact" for upsert conflict resolution. */
  prefer?: string;
  signal?: AbortSignal;
}

function buildQuery(options: QueryOptions): string {
  const params = new URLSearchParams();
  if (options.select) params.set("select", options.select);
  if (options.filters) {
    for (const [key, value] of Object.entries(options.filters)) {
      if (value === null || value === undefined) continue;
      params.set(key, String(value));
    }
  }
  if (options.order) {
    const dir = options.order.ascending === false ? "desc" : "asc";
    params.set("order", `${options.order.column}.${dir}`);
  }
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  return params.toString();
}

export const supabase = {
  isConfigured: () => config.supabase.isConfigured,

  async get<T>(
    table: string,
    options: QueryOptions = {},
  ): Promise<T[]> {
    const query = buildQuery(options);
    const response = await fetchWithTimeout(`${baseUrl()}/${table}?${query}`, {
      headers: headers(),
      signal: options.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SupabaseError(
        `Supabase GET ${table} failed: ${response.status}`,
        response.status,
        body.slice(0, 300),
      );
    }
    return (await response.json()) as T[];
  },

  async getOne<T>(table: string, options: QueryOptions = {}): Promise<T | null> {
    const rows = await supabase.get<T>(table, { ...options, limit: 1 });
    return rows[0] ?? null;
  },

  async rpc<TResult = unknown>(fn: string, payload: unknown): Promise<TResult> {
    const response = await fetchWithTimeout(`${baseUrl()}/rpc/${fn}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SupabaseError(
        `Supabase RPC ${fn} failed: ${response.status}`,
        response.status,
        body.slice(0, 300),
      );
    }
    if (response.status === 204) return undefined as TResult;
    return (await response.json()) as TResult;
  },

  async insert<T>(table: string, rows: T | T[], prefer?: string): Promise<void> {
    const response = await fetchWithTimeout(`${baseUrl()}/${table}`, {
      method: "POST",
      headers: headers(prefer ? { Prefer: prefer } : {}),
      body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SupabaseError(
        `Supabase INSERT ${table} failed: ${response.status}`,
        response.status,
        body.slice(0, 300),
      );
    }
  },

  async update<T>(
    table: string,
    match: Record<string, string>,
    changes: Partial<T>,
  ): Promise<void> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(match)) {
      params.set(key, `eq.${value}`);
    }
    const response = await fetchWithTimeout(`${baseUrl()}/${table}?${params}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(changes),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SupabaseError(
        `Supabase UPDATE ${table} failed: ${response.status}`,
        response.status,
        body.slice(0, 300),
      );
    }
  },

  /** Atomically update only matching rows and return their selected IDs. */
  async updateMatchingIds<T>(table: string, match: Record<string, string>, changes: Partial<T>): Promise<string[]> {
    const params = new URLSearchParams({ select: "id" });
    for (const [key, value] of Object.entries(match)) params.set(key, `eq.${value}`);
    const response = await fetchWithTimeout(`${baseUrl()}/${table}?${params}`, {
      method: "PATCH", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(changes),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SupabaseError(`Supabase UPDATE ${table} failed: ${response.status}`, response.status, body.slice(0, 300));
    }
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== "string")) throw new Error("Unexpected update response");
    return rows.map(row => row.id as string);
  },

  /** Delete only matching rows and return their selected IDs. */
  async deleteMatchingIds(table: string, match: Record<string, string>): Promise<string[]> {
    const params = new URLSearchParams({ select: "id" });
    for (const [key, value] of Object.entries(match)) params.set(key, `eq.${value}`);
    const response = await fetchWithTimeout(`${baseUrl()}/${table}?${params}`, {
      method: "DELETE", headers: headers({ Prefer: "return=representation" }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SupabaseError(`Supabase DELETE ${table} failed: ${response.status}`, response.status, body.slice(0, 300));
    }
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.id !== "string")) throw new Error("Unexpected delete response");
    return rows.map(row => row.id as string);
  },

  async delete(table: string, match: Record<string, string>): Promise<void> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(match)) {
      params.set(key, `eq.${value}`);
    }
    const response = await fetchWithTimeout(`${baseUrl()}/${table}?${params}`, {
      method: "DELETE",
      headers: headers(),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SupabaseError(
        `Supabase DELETE ${table} failed: ${response.status}`,
        response.status,
        body.slice(0, 300),
      );
    }
  },

  /**
   * Delete rows matching `match` whose `notInColumn` value is NOT in the
   * provided list. Used to replace child rows without a dangerous
   * delete-then-insert window. Values are passed through PostgREST's
   * `not.in.(...)` filter.
   */
  async deleteNotIn(
    table: string,
    match: Record<string, string>,
    notInColumn: string,
    notInValues: string[],
  ): Promise<void> {
    if (notInValues.length === 0) {
      // Nothing to keep — fall back to a plain match delete.
      await this.delete(table, match);
      return;
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(match)) {
      params.set(key, `eq.${value}`);
    }
    const inList = notInValues.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",");
    params.set(notInColumn, `not.in.(${inList})`);
    const response = await fetchWithTimeout(`${baseUrl()}/${table}?${params}`, {
      method: "DELETE",
      headers: headers(),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SupabaseError(
        `Supabase DELETE-NOT-IN ${table} failed: ${response.status}`,
        response.status,
        body.slice(0, 300),
      );
    }
  },
};
