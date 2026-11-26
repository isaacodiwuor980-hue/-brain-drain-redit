import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { idb, resetDBConnection } from "./db";
import { collectLocalExport, LOCAL_EXPORT_STORES } from "./local-data-export";
afterEach(() => { resetDBConnection(); vi.unstubAllGlobals(); });
describe("local browser data safety", () => {
  it("exports selected local stores and explicitly describes omitted data", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    await idb.putStrict("brains", { id: "one", title: "Test" });
    const result = await collectLocalExport();
    expect(result.data.brains).toEqual([{ id: "one", title: "Test" }]);
    expect(result.includedStores).toEqual([...LOCAL_EXPORT_STORES]);
    expect(result.notice).toContain("not a complete account export");
    expect(result.notice).toContain("more than one account");
  });
  it("rejects failed or nonexistent store reads rather than pretending empty data", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    await expect(idb.getAllStrict("no-such-store")).rejects.toThrow();
    resetDBConnection(); vi.stubGlobal("indexedDB", undefined);
    await expect(collectLocalExport()).rejects.toMatchObject({ name: "SecurityError" });
  });
  it("clears disposable IndexedDB data and reports blocked storage", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    await idb.putStrict("brains", { id: "one" });
    await idb.clearAllStrict(); expect(await idb.getAllStrict("brains")).toEqual([]);
    resetDBConnection(); vi.stubGlobal("indexedDB", undefined);
    await expect(idb.clearAllStrict()).rejects.toMatchObject({ name: "SecurityError" });
  });
});
