import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ local: vi.fn(), token: vi.fn(), cloud: vi.fn() }));
vi.mock("./db", () => ({ idb: { deleteBrainWithNodes: mock.local } }));
vi.mock("./auth-token", () => ({ getAuthToken: mock.token }));
vi.mock("./api/brains", () => ({ deleteBrain: mock.cloud }));
import { deleteBrainData } from "./delete-brain";
beforeEach(() => { vi.clearAllMocks(); mock.local.mockResolvedValue(undefined); });
describe("unscoped local brain deletion", () => {
  it("deletes only local data, not a current account's potentially unrelated cloud brain", async () => {
    expect(await deleteBrainData("b1")).toEqual({ cloud: "paused" });
    expect(mock.local).toHaveBeenCalledWith("b1");expect(mock.token).not.toHaveBeenCalled();expect(mock.cloud).not.toHaveBeenCalled();
  });
  it("rejects if local deletion fails and never contacts the cloud", async () => {
    mock.local.mockRejectedValueOnce(new Error("blocked"));
    await expect(deleteBrainData("b1")).rejects.toThrow("blocked");expect(mock.cloud).not.toHaveBeenCalled();
  });
});
