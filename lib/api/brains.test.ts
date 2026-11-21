/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getBrain, listBrains } from "./brains";
import { api } from "../api-client";

afterEach(() => vi.unstubAllGlobals());

describe("authenticated brain requests", () => {
  it("sends the token when requesting a private library", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ brains: [], hasMore: false, source: "test" }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await listBrains({ mine: true, authToken: "token-a" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/brains?mine=true");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("authorization")).toBe("Bearer token-a");
  });

  it("sends the token when fetching a private brain's details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ brain: { id: "b1" }, nodes: [] }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getBrain("b1", undefined, "token-b");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/brains/b1");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("authorization")).toBe("Bearer token-b");
  });

  it("does not coalesce same-URL requests with different authorization headers", async () => {
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      const token = new Headers(options.headers).get("authorization");
      return new Response(JSON.stringify({ token }), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const [first, second] = await Promise.all([
      api.get<{ token: string }>("/api/private", { headers: { Authorization: "Bearer a" } }),
      api.get<{ token: string }>("/api/private", { headers: { Authorization: "Bearer b" } }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.token).toBe("Bearer a");
    expect(second.token).toBe("Bearer b");
  });
});
