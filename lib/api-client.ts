import { env } from "./env";

/**
 * Thrown when an API call fails after exhausting retries or receives a
 * non-OK response. Callers can branch on `status` for 401/429/5xx handling.
 */
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions extends Omit<RequestInit, "signal"> {
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Number of retries on network/5xx errors for GET/HEAD only. Defaults to 0. Writes are never retried automatically. */
  retries?: number;
  /** AbortSignal from the caller. */
  signal?: AbortSignal;
  /** JSON body — serialized automatically. */
  json?: unknown;
  /** Reserved for compatibility; currently ignored. Refresh/replay requires
   * trusted account binding and operation-specific server guarantees. */
  refreshAuthOn401?: boolean;
  /** Coalesce concurrent identical GETs into one network request. */
  dedupe?: boolean;
}

/**
 * Exponential backoff with FULL JITTER.
 *
 * Why full jitter: after an outage every client retries on the same
 * schedule (200ms, 400ms, 800ms…), which re-creates the exact thundering
 * herd that caused the outage. Spreading each retry uniformly across
 * [0, cap] de-synchronises the fleet — the standard AWS "full jitter"
 * recipe. Exported so the policy is unit-tested rather than assumed.
 */
export function computeBackoffMs(attempt: number, capMs = 8_000, baseMs = 250): number {
  const exponential = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
  // random() in [0,1) → [0, exponential]
  return Math.round(Math.random() * exponential);
}

/** True when a failed attempt is worth repeating. */
export function isRetryableStatus(status: number): boolean {
  // 429 = rate limited, 408 = timeout, 5xx = server/upstream. Never retry
  // other 4xx: they are deterministic (bad input) and retrying just burns
  // battery and rate-limit budget.
  return status === 408 || status === 429 || status >= 500;
}

interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  request<T>(path: string, options?: RequestOptions): Promise<T>;
}

const JSON_CONTENT_TYPE = "application/json";

function buildUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // Same-origin by default: when VITE_API_BASE_URL is empty the browser calls
  // the same host that served the app (works behind the production reverse
  // proxy). When set, it points at the standalone API host.
  return `${env.apiBaseUrl}${normalizedPath}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes(JSON_CONTENT_TYPE)) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => "");
}

function shouldRetry(
  response: Response | null,
  attempt: number,
  retries: number,
  isOnline: boolean,
): boolean {
  if (attempt >= retries) return false;
  // Offline: a retry can only succeed if the network came back. Allow one
  // attempt to re-check connectivity rather than hammering a dead link.
  if (!response) return isOnline || attempt === 0;
  return isRetryableStatus(response.status);
}

/** In-flight GET coalescing (identical URL+method share one request). */
const inflightGets = new Map<string, Promise<unknown>>();

function isOffline(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

function createClient(): ApiClient {
  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const {
      timeoutMs = env.apiTimeoutMs,
      retries = 0,
      signal: externalSignal,
      json,
      headers,
      body,
      refreshAuthOn401: _refreshAuthOn401,
      dedupe = false,
      ...init
    } = options;

    const url = buildUrl(path);
    const method = (init.method || "GET").toUpperCase();
    // A timeout, network error or 5xx can occur after a write committed. An
    // arbitrary idempotency header is not proof of server-side deduplication.
    const safeRetries = method === "GET" || method === "HEAD" ? retries : 0;
    const dedupeKey = `${method} ${url}`;

    // Requests with explicit headers may represent different users or content
    // negotiation. Never share their responses based only on URL.
    if (dedupe && method === "GET" && !externalSignal && !headers && !init.credentials) {
      const existing = inflightGets.get(dedupeKey);
      if (existing) return existing as Promise<T>;
      const promise = request<T>(path, { ...options, dedupe: false });
      inflightGets.set(dedupeKey, promise);
      try {
        return await promise;
      } finally {
        inflightGets.delete(dedupeKey);
      }
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    // Chain the caller's abort signal to our internal one.
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }

    const finalHeaders = new Headers(headers);
    let finalBody: BodyInit | undefined = body;
    if (json !== undefined) {
      finalHeaders.set("Content-Type", JSON_CONTENT_TYPE);
      finalBody = JSON.stringify(json);
    }

    let response: Response | null = null;
    let lastError: unknown;

    try {
      for (let attempt = 0; attempt <= safeRetries; attempt++) {
        try {
          response = await fetch(url, {
            ...init,
            method,
            headers: finalHeaders,
            body: finalBody,
            signal: controller.signal,
          });

          if (response.ok) {
            if (response.status === 204) return undefined as T;
            return (await parseResponseBody(response)) as T;
          }

          if (!shouldRetry(response, attempt, safeRetries, !isOffline())) {
            const parsed = await parseResponseBody(response);
            const message =
              (parsed as { error?: string } | null)?.error ||
              `Request failed with status ${response.status}`;
            throw new ApiError(message, response.status, parsed);
          }

          // Honor Retry-After when present, otherwise jittered backoff.
          const retryAfter = Number(response.headers.get("retry-after"));
          const backoff = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : computeBackoffMs(attempt);
          await delay(backoff);
        } catch (error) {
          lastError = error;
          if (controller.signal.aborted) {
            throw new ApiError("Request timed out or was aborted", 0);
          }
          if (error instanceof ApiError) throw error;
          if (!shouldRetry(null, attempt, safeRetries, !isOffline())) throw error;
          await delay(computeBackoffMs(attempt));
        }
      }

      if (response) {
        const parsed = await parseResponseBody(response);
        throw new ApiError(`Request failed with status ${response.status}`, response.status, parsed);
      }
      throw lastError instanceof Error
        ? new ApiError(lastError.message, 0)
        : new ApiError("Network request failed", 0);
    } finally {
      window.clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }
  }

  return {
    get<T>(path: string, options?: RequestOptions) {
      return request<T>(path, { dedupe: true, ...options, method: "GET" });
    },
    post<T>(path: string, body?: unknown, options?: RequestOptions) {
      return request<T>(path, { ...options, method: "POST", json: body });
    },
    request,
  };
}

export const api = createClient();
