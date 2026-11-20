import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ local: vi.fn(), token: vi.fn(), cloud: vi.fn(), enabled: true }));
vi.mock("./db", () => ({ idb: { deleteBrainWithNodes: mock.local } }));
vi.mock("./env", () => ({ env: { get apiEnabled() { return mock.enabled; } } }));
vi.mock("./auth-token", () => ({ getAuthToken: mock.token }));
vi.mock("./api/brains", () => ({ deleteBrain: mock.cloud, isBrainsError: (error: unknown, status: number) => (error as { status?: number })?.status === status }));
import { deleteBrainData } from "./delete-brain";

beforeEach(() => {
  mock.local.mockReset().mockResolvedValue(undefined);
  mock.token.mockReset().mockResolvedValue("token");
  mock.cloud.mockReset().mockResolvedValue(undefined);
  mock.enabled = true;
});

describe("brain deletion feedback", () => {
  it("returns confirmed status only after local and cloud deletion", async () => {
    expect(await deleteBrainData("b1")).toEqual({ cloud: "deleted" });
    expect(mock.local).toHaveBeenCalledWith("b1");
    expect(mock.cloud).toHaveBeenCalledWith("b1", "token");
  });
  it("does not claim deletion or contact the cloud if local storage fails", async () => {
    mock.local.mockRejectedValue(new Error("blocked"));
    await expect(deleteBrainData("b1")).rejects.toThrow("blocked");
    expect(mock.cloud).not.toHaveBeenCalled();
  });
  it("marks cloud deletion unconfirmed when signed out or network fails", async () => {
    mock.token.mockResolvedValueOnce(null);
    expect(await deleteBrainData("b1")).toEqual({ cloud: "unconfirmed" });
    mock.cloud.mockRejectedValueOnce(new Error("offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await deleteBrainData("b1")).toEqual({ cloud: "unconfirmed" });
    warn.mockRestore();
  });
  it("reports a missing cloud record separately", async () => {
    mock.cloud.mockRejectedValue({ status: 404 });
    expect(await deleteBrainData("b1")).toEqual({ cloud: "not-found" });
  });
});
