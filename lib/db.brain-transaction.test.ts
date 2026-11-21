import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { idb, openDB, resetDBConnection } from "./db";

afterEach(() => {
  resetDBConnection();
  vi.unstubAllGlobals();
});

describe("local brain import transaction", () => {
  it("commits the brain and every node together", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    await idb.saveBrainWithNodes({ id: "b1" }, [{ id: "n1" }, { id: "n2" }]);
    expect(await idb.get("brains", "b1")).toEqual({ id: "b1" });
    expect(await idb.get("nodes", "n1")).toEqual({ id: "n1" });
    expect(await idb.get("nodes", "n2")).toEqual({ id: "n2" });
  });

  it("rolls back the brain and earlier nodes if a node cannot be stored", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const invalid = { id: "bad", cannotClone: () => {} };
    await expect(idb.saveBrainWithNodes({ id: "b1" }, [{ id: "n1" }, invalid])).rejects.toThrow();
    expect(await idb.get("brains", "b1")).toBeUndefined();
    expect(await idb.get("nodes", "n1")).toBeUndefined();
  });

  it("does not overwrite local edits when cloud metadata is cached", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    await idb.put("brains", { id: "b1", title: "Offline edit" });
    await idb.cacheNewBrains([{ id: "b1", title: "Old cloud" }, { id: "b2", title: "New cloud" }]);
    expect(await idb.get("brains", "b1")).toEqual({ id: "b1", title: "Offline edit" });
    expect(await idb.get("brains", "b2")).toEqual({ id: "b2", title: "New cloud", __cloudMetadataOnly: true });
  });

  it("deletes one brain and its nodes without deleting another brain's nodes", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    await idb.saveBrainWithNodes({ id: "b1" }, [{ id: "n1", brain_id: "b1" }]);
    await idb.saveBrainWithNodes({ id: "b2" }, [{ id: "n2", brain_id: "b2" }]);
    await idb.deleteBrainWithNodes("b1");
    expect(await idb.get("brains", "b1")).toBeUndefined();
    expect(await idb.get("nodes", "n1")).toBeUndefined();
    expect(await idb.get("nodes", "n2")).toMatchObject({ brain_id: "b2" });
  });

  it("rejects deletion when storage is blocked", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(idb.deleteBrainWithNodes("b1")).rejects.toMatchObject({ name: "SecurityError" });
  });

  it("can retry after a synchronous database-open failure", async () => {
    vi.stubGlobal("indexedDB", { open: () => { throw new DOMException("blocked", "SecurityError"); } });
    await expect(openDB()).rejects.toMatchObject({ name: "SecurityError" });
    vi.stubGlobal("indexedDB", new IDBFactory());
    await expect(openDB()).resolves.toBeDefined();
  });

  it("rejects rather than falsely reporting success when storage is blocked", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(idb.saveBrainWithNodes({ id: "b1" }, [])).rejects.toMatchObject({ name: "SecurityError" });
  });
});

describe("authoritative single-record writes", () => {
  it("persists a post and rejects invalid values", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    await idb.putStrict("posts", { id: "p1", content: "saved" });
    expect(await idb.get("posts", "p1")).toEqual({ id: "p1", content: "saved" });
    await expect(idb.putStrict("posts", { id: "p2", fn: () => {} })).rejects.toThrow();
    expect(await idb.get("posts", "p2")).toBeUndefined();
  });
  it("rejects when storage is unavailable rather than claiming success", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(idb.putStrict("posts", { id: "p1" })).rejects.toMatchObject({ name: "SecurityError" });
  });
});
