import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { idb, resetDBConnection } from "./db";
import { collectLocalBrainExport } from "./brain-local-export";

afterEach(() => { resetDBConnection(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("local brain export", () => {
  it("preserves the import format and discloses scope and mixed accounts", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    await idb.putStrict("brains", { id: "synthetic", title: "Example" });
    await idb.putStrict("nodes", { id: "node", brain_id: "synthetic" });
    const result = await collectLocalBrainExport();
    expect(result.brains).toEqual([{ id: "synthetic", title: "Example" }]);
    expect(result.nodes).toEqual([{ id: "node", brain_id: "synthetic" }]);
    expect(result.notice).toMatch(/more than one account/i);
    expect(result.notice).toMatch(/cloud/i);
  });
  it("rejects an unreadable store rather than producing a partial export", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const read = vi.spyOn(idb, "getAllStrict");
    read.mockImplementation(async (store) => { if (store === "nodes") throw new Error("blocked"); return []; });
    await expect(collectLocalBrainExport()).rejects.toThrow("blocked");
  });
});
