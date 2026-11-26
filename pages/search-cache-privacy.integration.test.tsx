/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getAll: vi.fn(), useSkills: vi.fn() }));
vi.mock("@/lib/db", () => ({ idb: { getAll: mocks.getAll } }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks/use-skills", () => ({ useSkills: mocks.useSkills }));
vi.mock("@/hooks/use-discover", () => ({ useUserSearch: () => ({}), useFollowUser: () => ({}) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/RuntimeEngine", () => ({ RuntimeEngine: () => null }));
vi.mock("@/components/BrainDrawer", () => ({ BrainDrawer: () => null }));
vi.mock("@/lib/delete-brain", () => ({ deleteBrainData: vi.fn() }));
import { SearchPage } from "./SearchPage";
afterEach(() => { vi.clearAllMocks(); window.history.replaceState({}, "", "/"); });
describe("search cache privacy", () => {
  it("does not load or display unverified post or brain records", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState({}, "", "/search?q=secret");
    mocks.useSkills.mockReturnValue({ skills: [{ id: "s", title: "secret skill", domain: "", authorName: "", steps: [] }] });
    mocks.getAll.mockImplementation(async (store: string) => store === "topics" ? [] : [{ id: "x", title: "secret brain", content: "secret post" }]);
    const el = document.createElement("div"); document.body.append(el); const root = createRoot(el);
    try {
      await act(async () => { root.render(<SearchPage />); });
      await vi.waitFor(() => expect(mocks.getAll).toHaveBeenCalledWith("topics"));
      expect(mocks.getAll.mock.calls.map(c => c[0])).toEqual(["topics"]);
      expect(el.textContent).not.toContain("secret brain");
      expect(el.textContent).not.toContain("secret post");
      expect(el.textContent).not.toContain("secret skill");
      expect(mocks.useSkills).not.toHaveBeenCalled();
      expect(el.textContent).toContain("Brain and post search is temporarily unavailable");
    } finally { await act(async () => root.unmount()); el.remove(); }
  });
});
