/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ toast: vi.fn(), get: vi.fn(async () => undefined), getAllStrict: vi.fn(), clearAllStrict: vi.fn() }));
vi.mock("@/lib/db", () => ({ idb: mock }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@/components/auth/AuthContext", () => ({ useAuth: () => ({ user: null, profile: null, updateProfileData: vi.fn(), logOut: vi.fn() }) }));
import { SettingsPage } from "../pages/SettingsPage";
let container: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("settings local data controls", () => {
  it("discloses local-only scope and cancels destructive clear when declined", async () => {
    await act(async () => root.render(<SettingsPage />));
    const advanced = container.querySelector<HTMLButtonElement>("#advanced > button");
    await act(async () => advanced?.click());
    expect(container.textContent).toContain("Export selected local data");
    expect(container.textContent).toContain("does not delete your account or cloud data");
    const confirm = vi.fn().mockReturnValue(false); vi.stubGlobal("confirm", confirm);
    const clear = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Clear local browser data"));
    await act(async () => clear?.click());
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("cloud data will NOT be deleted"));
    expect(mock.clearAllStrict).not.toHaveBeenCalled();
  });
  it("does not imply that local privacy or telemetry preferences are enforced", async () => {
    await act(async () => root.render(<SettingsPage />));
    expect(container.textContent).toContain("privacy, push, and analytics controls are not yet enforced");
    await act(async () => container.querySelector<HTMLButtonElement>("#privacy > button")?.click());
    expect(container.textContent).toContain("does not restrict profile, post, or brain visibility");
    expect(container.textContent).toContain("does not currently control analytics collection");
  });
  it("reports an unreadable store instead of claiming a complete export", async () => {
    await act(async () => root.render(<SettingsPage />));
    await act(async () => container.querySelector<HTMLButtonElement>("#advanced > button")?.click());
    mock.getAllStrict.mockRejectedValueOnce(new Error("blocked"));
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Export selected local data"))?.click());
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Local export failed", variant: "destructive" }));
  });
  it("reports failure rather than claiming data was cleared", async () => {
    await act(async () => root.render(<SettingsPage />));
    await act(async () => container.querySelector<HTMLButtonElement>("#advanced > button")?.click());
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true)); mock.clearAllStrict.mockRejectedValueOnce(new Error("blocked"));
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Clear local browser data"))?.click());
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not clear local data", variant: "destructive" }));
  });
});
