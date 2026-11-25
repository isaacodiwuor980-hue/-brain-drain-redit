/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ useDatabase: vi.fn() }));
vi.mock("@/hooks/use-database", () => ({ useDatabase: m.useDatabase }));
vi.mock("@/components/Dashboard", () => ({ Dashboard: () => <div>synthetic private brain</div> }));
import { LibraryPage } from "./LibraryPage";
describe("unverified library privacy", () => {
  it("does not mount cached brain views while ownership and visibility are unverified", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    m.useDatabase.mockReturnValue({ brains: [{ id: "b", title: "synthetic private brain" }] });
    const el = document.createElement("div"); document.body.append(el); const root = createRoot(el);
    try {
      await act(async () => { root.render(<LibraryPage />); });
      expect(el.textContent).not.toContain("synthetic private brain");
      expect(el.textContent).toContain("Brain library is temporarily unavailable");
      expect(m.useDatabase).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); el.remove(); }
  });
});
