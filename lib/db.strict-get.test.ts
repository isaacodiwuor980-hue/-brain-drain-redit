import {afterEach,describe,expect,it,vi} from "vitest";
import {IDBFactory} from "fake-indexeddb";
import {idb,resetDBConnection} from "./db";
afterEach(()=>{resetDBConnection();vi.unstubAllGlobals();});
describe("strict single-record read",()=>{
  it("distinguishes a missing record from a storage failure",async()=>{
    vi.stubGlobal("indexedDB",new IDBFactory());
    expect(await idb.getStrict("posts","missing")).toBeUndefined();
    await idb.putStrict("posts",{id:"synthetic",userId:"synthetic"});
    expect(await idb.getStrict("posts","synthetic")).toEqual({id:"synthetic",userId:"synthetic"});
    await expect(idb.getStrict("nonexistent","x")).rejects.toThrow();
    resetDBConnection();vi.stubGlobal("indexedDB",undefined);
    await expect(idb.getStrict("posts","synthetic")).rejects.toMatchObject({name:"SecurityError"});
  });
});
