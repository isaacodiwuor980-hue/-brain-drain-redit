import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { idb, openDB, resetDBConnection } from "./db";

afterEach(() => { resetDBConnection(); vi.unstubAllGlobals(); });
it("upgrades a synthetic v19 database without replacing old stores or records", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("brainBuilder", 19);
    request.onupgradeneeded = () => {
      const brains = request.result.createObjectStore("brains", { keyPath: "id" });
      brains.put({ id: "synthetic", title: "Preserve me" });
      request.result.createObjectStore("nodes", { keyPath: "id" }).put({ id: "node", brain_id: "synthetic" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  old.close();
  const updated = await openDB();
  expect(updated.version).toBe(21);
  expect(await idb.getAllStrict("brains")).toEqual([{ id: "synthetic", title: "Preserve me" }]);
  expect(await idb.getAllStrict("nodes")).toEqual([{ id: "node", brain_id: "synthetic" }]);
  expect(updated.objectStoreNames.contains("library_entries")).toBe(true);
  expect(updated.transaction("library_entries").objectStore("library_entries").indexNames.contains("roomId")).toBe(true);
});
