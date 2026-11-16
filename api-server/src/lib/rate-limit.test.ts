import { describe, expect, it, vi } from "vitest";
import { createInMemoryLimiter, createRedisLimiter, type RedisLike } from "./rate-limit";

/** Minimal Express-ish request stub. */
function makeReq(ip = "203.0.113.7") {
  return { ip, socket: { remoteAddress: ip } } as never;
}

/** Chainable response stub with header + status + body accessors. */
interface TestRes {
  setHeader: (k: string, v: string) => void;
  status: (code: number) => TestRes;
  json: (payload: unknown) => void;
  headers: Record<string, string>;
  getStatus: () => number;
  getBody: () => unknown;
}
function makeRes(): TestRes {
  const headers: Record<string, string> = {};
  let status = 200;
  let body: unknown;
  const res: TestRes = {
    setHeader: (k, v) => {
      headers[k] = String(v);
    },
    status: (code) => {
      status = code;
      return res;
    },
    json: (payload) => {
      body = payload;
    },
    headers,
    getStatus: () => status,
    getBody: () => body,
  };
  return res;
}

describe("createInMemoryLimiter", () => {
  it("allows requests up to the limit and sets X-RateLimit headers", () => {
    const limiter = createInMemoryLimiter({ windowMs: 1000, max: 3 });
    let last: TestRes | null = null;
    for (let i = 0; i < 3; i++) {
      const res = makeRes();
      last = res;
      const next = vi.fn();
      limiter(makeReq(), res as never, next as never);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.getStatus()).toBe(200);
    }
    expect(last!.headers["X-RateLimit-Limit"]).toBe("3");
    expect(last!.headers["X-RateLimit-Remaining"]).toBeDefined();
  });

  it("rejects the (max+1)th request in the same window with 429", () => {
    const limiter = createInMemoryLimiter({ windowMs: 1000, max: 2 });
    limiter(makeReq(), makeRes() as never, vi.fn() as never);
    limiter(makeReq(), makeRes() as never, vi.fn() as never);
    const res = makeRes();
    const next = vi.fn();
    limiter(makeReq(), res as never, next as never);
    expect(next).not.toHaveBeenCalled();
    expect(res.getStatus()).toBe(429);
    expect(res.getBody()).toEqual({ error: "Too many requests, please try again later." });
  });

  it("keys per-IP so different clients get separate budgets", () => {
    const limiter = createInMemoryLimiter({ windowMs: 1000, max: 1 });
    limiter(makeReq("1.1.1.1"), makeRes() as never, vi.fn() as never);
    const res = makeRes();
    const next = vi.fn();
    limiter(makeReq("2.2.2.2"), res as never, next as never);
    // Different IP → its own budget, allowed.
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("createRedisLimiter", () => {
  /** Hand-rolled Redis mock — no ioredis dep needed for the test. */
  function makeRedisMock(): RedisLike & { calls: string[] } {
    const counts = new Map<string, number>();
    const ttls = new Map<string, number>();
    const calls: string[] = [];
    return {
      calls,
      async incr(key) {
        calls.push(`incr:${key}`);
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        return n;
      },
      async expire(key, sec) {
        calls.push(`expire:${key}:${sec}`);
        ttls.set(key, sec);
        return 1;
      },
      async ttl(key) {
        calls.push(`ttl:${key}`);
        return ttls.get(key) ?? -2;
      },
    };
  }

  it("uses INCR + EXPIRE-on-first and allows within the limit", async () => {
    const redis = makeRedisMock();
    const limiter = createRedisLimiter(redis, { windowMs: 5000, max: 3 });
    for (let i = 0; i < 3; i++) {
      const res = makeRes();
      const next = vi.fn();
      await limiter(makeReq(), res as never, next as never);
      expect(next).toHaveBeenCalledTimes(1);
    }
    // First request sets expire once (window=5s → 5s).
    expect(redis.calls).toContain("expire:rl:203.0.113.7:5");
    expect(redis.calls.filter((c) => c.startsWith("incr:"))).toHaveLength(3);
  });

  it("rejects over-limit requests with 429", async () => {
    const redis = makeRedisMock();
    const limiter = createRedisLimiter(redis, { windowMs: 5000, max: 2 });
    await limiter(makeReq(), makeRes() as never, vi.fn() as never);
    await limiter(makeReq(), makeRes() as never, vi.fn() as never);
    const res = makeRes();
    const next = vi.fn();
    await limiter(makeReq(), res as never, next as never);
    expect(next).not.toHaveBeenCalled();
    expect(res.getStatus()).toBe(429);
  });

  it("throws (so the factory can fall back to in-memory) when Redis errors", async () => {
    const brokenRedis: RedisLike = {
      async incr() {
        throw new Error("ECONNREFUSED");
      },
      async expire() {
        return 0;
      },
      async ttl() {
        return -2;
      },
    };
    const limiter = createRedisLimiter(brokenRedis, { windowMs: 5000, max: 10 });
    await expect(limiter(makeReq(), makeRes() as never, vi.fn() as never)).rejects.toThrow(
      "Redis rate-limit lookup failed",
    );
  });
});
