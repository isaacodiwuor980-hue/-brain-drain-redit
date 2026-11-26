import { describe, expect, it, vi } from "vitest";
import { createAtomicRedisLimiter } from "./rate-limit";
function req() { return { ip: "203.0.113.1" } as never; }
function res() {
  const headers: Record<string, string> = {}; let status = 200;
  const value = { setHeader: (key: string, val: string) => { headers[key] = val; }, status: (v: number) => { status = v; return value; }, json: vi.fn(), headers, getStatus: () => status };
  return value;
}
describe("atomic Redis limiter", () => {
  it("isolates tier keys and shares each tier counter across instances", async () => {
    const counts = new Map<string, number>();
    const client = { eval: vi.fn(async (_script: string, _n: number, key: string, _window: number): Promise<unknown> => {
      const count = (counts.get(key) ?? 0) + 1; counts.set(key, count); return [count, 5];
    }) };
    const read = createAtomicRedisLimiter(client, { namespace: "read", windowMs: 5000, max: 2 });
    const auth = createAtomicRedisLimiter(client, { namespace: "auth", windowMs: 5000, max: 1 });
    const auth2 = createAtomicRedisLimiter(client, { namespace: "auth", windowMs: 5000, max: 1 });
    const nextRead = vi.fn(), nextAuth = vi.fn();
    await read(req(), res() as never, nextRead as never);
    await auth(req(), res() as never, nextAuth as never);
    const denied = res(), next = vi.fn(); await auth2(req(), denied as never, next as never);
    expect(nextRead).toHaveBeenCalledOnce(); expect(nextAuth).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled(); expect(denied.getStatus()).toBe(429);
    expect(client.eval.mock.calls.map(call => call[2])).toEqual(["rl:v2:read:203.0.113.1", "rl:v2:auth:203.0.113.1", "rl:v2:auth:203.0.113.1"]);
    const script = client.eval.mock.calls[0][0];
    expect(script).toContain("redis.call('INCR'"); expect(script).toContain("redis.call('EXPIRE'"); expect(client.eval.mock.calls[0][3]).toBe(5);
  });
  it("fails to the caller on Redis failure or malformed response", async () => {
    for (const response of [null, [1, -1], ["1", 5], [0, 5]]) {
      const limiter = createAtomicRedisLimiter({ eval: vi.fn().mockResolvedValue(response) }, { windowMs: 5000, max: 1 });
      await expect(limiter(req(), res() as never, vi.fn() as never)).rejects.toThrow("Redis rate-limit lookup failed");
    }
    const limiter = createAtomicRedisLimiter({ eval: vi.fn().mockRejectedValue(new Error("sensitive")) }, { windowMs: 5000, max: 1 });
    await expect(limiter(req(), res() as never, vi.fn() as never)).rejects.toThrow("Redis rate-limit lookup failed");
  });
});
