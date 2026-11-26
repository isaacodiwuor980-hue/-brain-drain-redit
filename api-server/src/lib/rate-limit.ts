import type { NextFunction, Request, Response } from "express";
import { config } from "./config";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Distinct budgets must not share Redis keys across limiter tiers. */
  namespace?: "read" | "write" | "auth";
}

interface Bucket {
  count: number;
  resetAt: number;
}

export type RateLimiter = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

/**
 * Minimal contract for the Redis client the Redis limiter needs. Keeping it
 * structural means tests can inject a hand-rolled mock without the `ioredis`
 * dependency, and any Redis-compatible client (ioredis, node-redis) works.
 */
export interface RedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

function setHeaders(res: Response, limit: number, remaining: number, resetEpochSec: number) {
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  res.setHeader("X-RateLimit-Reset", String(resetEpochSec));
}

function reject(res: Response) {
  res.status(429).json({ error: "Too many requests, please try again later." });
}

/**
 * Per-instance in-memory fixed-window counter. Used when REDIS_URL is unset
 * AND as the fail-over when Redis is unreachable, so a Redis outage never
 * takes the API down (the guarantee weakens to per-instance, but stays up).
 *
 * Exported for direct unit testing.
 */
export function createInMemoryLimiter({ windowMs, max }: RateLimitOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();

  // Periodically drop stale buckets so the map cannot grow unbounded.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  cleanup.unref?.();

  return function rateLimit(req, res, next) {
    // S-1 fix: key on req.ip (respects Express `trust proxy`), NOT the raw
    // X-Forwarded-For header (client-spoofable). When trust proxy is false
    // (direct mode), req.ip falls back to req.socket.remoteAddress.
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    setHeaders(res, max, Math.max(0, max - bucket.count), Math.ceil(bucket.resetAt / 1000));

    if (bucket.count > max) {
      reject(res);
      return;
    }
    next();
  };
}

/**
 * Redis-backed fixed-window counter — shared across instances so a fleet
 * behind a load balancer enforces a single budget per IP. Takes an injected
 * client so the path is unit-testable without a live Redis instance.
 *
 * Legacy helper retained for compatibility and existing unit tests. It uses
 * non-atomic INCR/EXPIRE and must not be used by the runtime factory.
 */
export function createRedisLimiter(client: RedisLike, { windowMs, max }: RateLimitOptions): RateLimiter {
  const windowSec = Math.ceil(windowMs / 1000);

  return async function rateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const key = `rl:${ip}`;
    try {
      const count = await client.incr(key);
      // Set TTL only on the first increment of a fresh window.
      if (count === 1) await client.expire(key, windowSec);
      const ttl = await client.ttl(key);
      const resetEpochSec = Math.ceil(Date.now() / 1000) + Math.max(ttl, 0);
      setHeaders(res, max, Math.max(0, max - count), resetEpochSec);
      if (count > max) {
        reject(res);
        return;
      }
      next();
    } catch {
      // Never let a Redis blip 500 the request — the caller's fallback
      // (see createRateLimiter) handles in-memory degradation. Re-throw so
      // the factory's try/catch can route to the in-memory limiter.
      throw new Error("Redis rate-limit lookup failed");
    }
  };
}

/** Runtime Redis limiter. A single script increments and repairs/sets expiry
 * atomically, so a dropped connection cannot leave a permanent counter. */
export function createAtomicRedisLimiter(
  client: { eval(script: string, numKeys: number, key: string, seconds: number): Promise<unknown> },
  { windowMs, max, namespace = "read" }: RateLimitOptions,
): RateLimiter {
  const windowSec = Math.ceil(windowMs / 1000);
  const script = `
    local count = redis.call('INCR', KEYS[1])
    local ttl = redis.call('TTL', KEYS[1])
    if ttl < 0 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
      ttl = redis.call('TTL', KEYS[1])
    end
    return {count, ttl}
  `;
  return async function rateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const key = `rl:v2:${namespace}:${ip}`;
    try {
      const result = await client.eval(script, 1, key, windowSec);
      if (!Array.isArray(result) || result.length !== 2 ||
          !Number.isSafeInteger(result[0]) || result[0] < 1 ||
          !Number.isSafeInteger(result[1]) || result[1] < 0) {
        throw new Error("Invalid rate-limit response");
      }
      const [count, ttl] = result as [number, number];
      setHeaders(res, max, Math.max(0, max - count), Math.ceil(Date.now() / 1000) + ttl);
      if (count > max) { reject(res); return; }
      next();
    } catch {
      throw new Error("Redis rate-limit lookup failed");
    }
  };
}

/**
 * Factory used by app.ts. Picks Redis (lazy-init, dynamic import so the
 * `ioredis` dep is only required when REDIS_URL is set) and falls back to
 * the in-memory limiter if Redis is unreachable on ANY request.
 */
export function createRateLimiter(opts: RateLimitOptions): RateLimiter {
  const memory = createInMemoryLimiter(opts);
  const redisUrl = config.redis.url;
  if (!redisUrl) return memory;

  // Lazy: connect on first request so server boot never blocks on Redis.
  let clientPromise: Promise<import("ioredis").default | null> | null = null;
  const getClient = async (): Promise<import("ioredis").default | null> => {
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      try {
        const mod = await import("ioredis");
        const Redis = mod.default;
        const redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          lazyConnect: true,
        });
        await redis.connect();
        return redis;
      } catch {
        // Dep missing, URL bad, or connect failed — permanently degrade to
        // in-memory for this process. A later restart retries.
        return null;
      }
    })();
    return clientPromise;
  };

  return async function rateLimit(req, res, next) {
    const client = await getClient();
    if (!client) return memory(req, res, next);
    const primary = createAtomicRedisLimiter(client, opts);
    try {
      await primary(req, res, next);
    } catch {
      // Redis failed mid-request — degrade to in-memory for this one call.
      await memory(req, res, next);
    }
  };
}
