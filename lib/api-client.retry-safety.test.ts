// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api-client";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("API retry containment", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])("does not replay %s after an uncertain 5xx, even with a retry count and idempotency header", async method => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"error":"unavailable"}', {status: 503, headers: {"content-type":"application/json"}}));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.request("/write", {method, json: {x:1}, retries: 2, refreshAuthOn401: true, headers: {"Authorization":"Bearer old-account", "Idempotency-Key":"not-yet-verified"}})).rejects.toMatchObject({status: 503});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not replay a write after a lost response", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network failed"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.post("/write", {x:1}, {retries: 2})).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not refresh or replace the initiating credential after a stale-session 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unauthorized", {status:401}));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.request("/write", {method:"POST", refreshAuthOn401:true, retries:2, headers:{Authorization:"Bearer account-a"}})).rejects.toMatchObject({status:401});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer account-a");
  });
  it("does not replay an in-flight write after an account switch", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const account = { current: "account-a" };
    const request = api.request("/write", {method:"POST", retries:2, refreshAuthOn401:true, headers:{Authorization:`Bearer ${account.current}`}});
    account.current = "account-b";
    finish(new Response("unauthorized", {status:401}));
    await expect(request).rejects.toMatchObject({status:401});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer account-a");
  });
  it("does not refresh a stale GET either while account binding is unverified", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unauthorized", {status:401}));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.get("/read", {refreshAuthOn401:true, retries:1, headers:{Authorization:"Bearer account-a"}})).rejects.toMatchObject({status:401});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("can retry a transient GET with the original credential", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("unavailable", {status:503})).mockResolvedValueOnce(new Response('{"ok":true}', {status:200,headers:{"content-type":"application/json"}}));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.get("/read", {retries:1, headers:{Authorization:"Bearer account-a"}})).resolves.toEqual({ok:true});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer account-a");
  });
  it("does not replay an aborted in-flight write", async () => {
    const fetchMock = vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.request("/write", {method:"POST", retries:2, timeoutMs:10})).rejects.toMatchObject({status:0});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
