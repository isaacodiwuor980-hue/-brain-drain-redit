/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ toast: vi.fn(), get: vi.fn(async () => undefined), getAllStrict: vi.fn(), clearAllStrict: vi.fn(), getLocalAnalyticsControl: vi.fn(async () => ({enabled:true,epoch:0})), setLocalAnalyticsEnabled: vi.fn(async (_value: boolean) => undefined), clearLocalAnalytics: vi.fn(async () => undefined) }));
vi.mock("@/lib/db", () => ({ idb: mock }));
vi.mock("@/lib/local-analytics-control", () => ({ getLocalAnalyticsControl: mock.getLocalAnalyticsControl, setLocalAnalyticsEnabled: mock.setLocalAnalyticsEnabled, clearLocalAnalytics: mock.clearLocalAnalytics, LOCAL_ANALYTICS_CHANGE: "test-activity-change" }));
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
  it("explains browser-only activity and unimplemented profile controls", async () => {
    await act(async () => root.render(<SettingsPage />));
    await act(async () => container.querySelector<HTMLButtonElement>("#privacy > button")?.click());
    expect(container.textContent).toContain("does not restrict profile, post, or brain visibility");
    expect(container.textContent).toContain("does not delete activity already sent, control other devices, or stop other analytics services");
    const activitySwitch = container.querySelector<HTMLButtonElement>('[aria-labelledby="local-activity-label"]');
    expect(activitySwitch?.getAttribute("aria-checked")).toBe("true");
    await act(async () => activitySwitch?.click());
    expect(mock.setLocalAnalyticsEnabled).toHaveBeenCalledWith(false);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Clear saved browser activity"))?.click());
    expect(mock.clearLocalAnalytics).not.toHaveBeenCalled();
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
