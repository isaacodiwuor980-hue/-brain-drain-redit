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
    const read = vi.spyOn(idb, "readBrainExportSnapshot");
    read.mockRejectedValue(new Error("blocked"));
    await expect(collectLocalBrainExport()).rejects.toThrow("blocked");
  });
  it("exports a consistent local brain and its own nodes only", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    await idb.saveBrainWithNodes({id:"b1",title:"one"},[{id:"n1",brain_id:"b1"}]);
    await idb.saveBrainWithNodes({id:"b2",title:"two"},[{id:"n2",brain_id:"b2"}]);
    const result=await collectLocalBrainExport("b1");
    expect(result.brains).toEqual([{id:"b1",title:"one"}]);
    expect(result.nodes).toEqual([{id:"n1",brain_id:"b1"}]);
  });
  it("refuses missing brains and incomplete cloud stubs", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    await expect(collectLocalBrainExport("missing")).rejects.toThrow(/unavailable/);
    await idb.cacheNewBrains([{id:"stub"}]);
    await expect(collectLocalBrainExport("stub")).rejects.toThrow(/unavailable/);
  });
  it("rejects blocked local storage instead of returning an empty export", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(collectLocalBrainExport()).rejects.toMatchObject({name:"SecurityError"});
  });
  it("reads brains and nodes before a concurrent atomic write takes effect", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    await idb.saveBrainWithNodes({id:"b1",title:"old"},[{id:"n1",brain_id:"b1",text:"old"}]);
    const snapshot=collectLocalBrainExport("b1");
    const save=idb.saveBrainWithNodes({id:"b1",title:"new"},[{id:"n1",brain_id:"b1",text:"new"}]);
    const result=await snapshot;await save;
    expect(result.brains[0]).toMatchObject({title:"old"});expect(result.nodes[0]).toMatchObject({text:"old"});
  });

});
