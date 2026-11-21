import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./config", () => ({ config: { supabase: { url: "https://example.test", serviceRoleKey: "test-only", isConfigured: true } } }));
import { supabase } from "./supabase";
afterEach(() => { vi.unstubAllGlobals(); });
describe("owner-conditioned PostgREST update", () => {
  it("sends both id and owner predicates in the same PATCH and requests IDs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: "skill-1" }]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await supabase.updateMatchingIds("skills", { id: "skill-1", author_id: "alice" }, { title: "Updated" })).toEqual(["skill-1"]);
    const [rawUrl, options] = fetchMock.mock.calls[0]; const url = new URL(rawUrl);
    expect(url.pathname).toBe("/rest/v1/skills"); expect(url.searchParams.get("id")).toBe("eq.skill-1"); expect(url.searchParams.get("author_id")).toBe("eq.alice"); expect(url.searchParams.get("select")).toBe("id");
    expect(options.method).toBe("PATCH"); expect(options.headers.Prefer).toBe("return=representation");
  });
  it("sends an owner-conditioned DELETE and observes missing rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await supabase.deleteMatchingIds("skills", { id: "skill-1", author_id: "alice" })).toEqual([]);
    const [rawUrl, options] = fetchMock.mock.calls[0]; const url = new URL(rawUrl);
    expect(url.searchParams.get("id")).toBe("eq.skill-1"); expect(url.searchParams.get("author_id")).toBe("eq.alice");
    expect(options.method).toBe("DELETE"); expect(options.headers.Prefer).toBe("return=representation");
  });
  it("rejects an unexpected success body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "skill-1" }), { status: 200 })));
    await expect(supabase.updateMatchingIds("skills", { id: "skill-1", author_id: "alice" }, {})).rejects.toThrow("Unexpected update response");
  });
});
