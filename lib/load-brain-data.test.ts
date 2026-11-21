import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { idb, resetDBConnection } from "./db";
import type { Brain, Node } from "./types";

const mocks = vi.hoisted(() => ({ getBrain: vi.fn(), getAuthToken: vi.fn(), apiEnabled: true }));
vi.mock("./env", () => ({ env: { get apiEnabled() { return mocks.apiEnabled; } } }));
vi.mock("./auth-token", () => ({ getAuthToken: mocks.getAuthToken }));
vi.mock("./api/brains", () => ({ getBrain: mocks.getBrain }));
import { loadBrainData } from "./load-brain-data";

const brain: Brain = { id: "b1", title: "Remote", category: "", description: "", created_at: 1, root_node_id: "n1" };
const node: Node = { id: "n1", brain_id: "b1", node_type: "outcome", result_text: "Done" };

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  mocks.apiEnabled = true;
  mocks.getAuthToken.mockReset().mockResolvedValue("token");
  mocks.getBrain.mockReset().mockResolvedValue({ brain, nodes: [node], source: "test" });
});
afterEach(() => { resetDBConnection(); vi.unstubAllGlobals(); });

describe("cloud brain hydration", () => {
  it("loads a marked cloud stub with authentication and caches its nodes", async () => {
    await idb.cacheNewBrains([brain]);
    const result = await loadBrainData("b1");
    expect(mocks.getBrain).toHaveBeenCalledWith("b1", undefined, "token");
    expect(result).toEqual({ brain, nodes: [node] });
    expect(await loadBrainData("b1")).toEqual(result);
    expect(mocks.getBrain).toHaveBeenCalledTimes(1);
  });

  it("keeps local edits made while the cloud request is pending", async () => {
    await idb.cacheNewBrains([brain]);
    let resolve!: (value: unknown) => void;
    mocks.getBrain.mockReturnValue(new Promise((r) => { resolve = r; }));
    const pending = loadBrainData("b1");
    await vi.waitFor(() => expect(mocks.getBrain).toHaveBeenCalled());
    const edited = { ...brain, title: "Local edit" };
    const localNode = { ...node, result_text: "Local" };
    await idb.saveBrainWithNodes(edited, [localNode]);
    resolve({ brain, nodes: [node] });
    expect(await pending).toEqual({ brain: edited, nodes: [localNode] });
  });

  it("fails without changing the stub when network fetch fails", async () => {
    await idb.cacheNewBrains([brain]);
    mocks.getBrain.mockRejectedValue(new Error("offline"));
    await expect(loadBrainData("b1")).rejects.toThrow("offline");
    expect(await idb.get("brains", "b1")).toMatchObject({ __cloudMetadataOnly: true });
    expect(await idb.getAllByIndex("nodes", "brain_id", "b1")).toEqual([]);
  });

  it("does not overwrite a node belonging to another brain", async () => {
    await idb.cacheNewBrains([brain]);
    await idb.put("nodes", { ...node, brain_id: "other" });
    await expect(loadBrainData("b1")).rejects.toThrow();
    expect(await idb.get("nodes", "n1")).toMatchObject({ brain_id: "other" });
    expect(await idb.get("brains", "b1")).toMatchObject({ __cloudMetadataOnly: true });
  });

  it("does not fetch or overwrite an existing local brain", async () => {
    await idb.saveBrainWithNodes(brain, [node]);
    expect(await loadBrainData("b1")).toEqual({ brain, nodes: [node] });
    expect(mocks.getBrain).not.toHaveBeenCalled();
  });
});
