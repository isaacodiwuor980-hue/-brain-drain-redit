/**
 * Regression guards for the storage-blocked preview fix (commit 72fc09d).
 *
 * Failure mode being guarded: in sandboxed preview iframes (z.ai embed) and
 * Safari ITP third-party contexts, merely ACCESSING indexedDB throws
 * SecurityError. lib/db.ts must degrade to safe defaults so the cloud API
 * remains the data source and the home feed still renders.
 *
 * These tests simulate the blocked environment by defining a throwing
 * getter for globalThis.indexedDB — mirroring real browser behavior where
 * the ACCESS itself throws (not just open()).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type RealIndexedDB = typeof globalThis.indexedDB;

async function withBlockedIndexedDB(fn: () => Promise<void>) {
  const original: RealIndexedDB | undefined = Object.getOwnPropertyDescriptor(globalThis, "indexedDB")?.get
    ? undefined
    : globalThis.indexedDB;

  const throwingGetter = () => {
    throw new DOMException(
      "Access to storage is not allowed from this context",
      "SecurityError",
    );
  };

  // Simulate the blocked context: the property ACCESS throws.
  Object.defineProperty(globalThis, "indexedDB", {
    get: throwingGetter,
    configurable: true,
  });

  try {
    await fn();
  } finally {
    if (original !== undefined) {
      Object.defineProperty(globalThis, "indexedDB", {
        value: original,
        writable: true,
        configurable: true,
      });
    } else {
      // Restore a delete-able property so other tests are unaffected.
      try {
        delete (globalThis as { indexedDB?: unknown }).indexedDB;
      } catch {
        Object.defineProperty(globalThis, "indexedDB", {
          get: throwingGetter,
          configurable: true,
        });
      }
    }
    // Reset module state (openDB caches dbPromise + the blocked log flag).
    vi.resetModules();
  }
}

async function loadDbModule() {
  // Fresh module instance per test so the one-time warning log flag and the
  // cached dbPromise don't leak between tests.
  const mod = await import("../lib/db");
  return mod;
}

describe("lib/db storage-blocked degradation (preview fix)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getAll resolves to [] when indexedDB access throws", async () => {
    await withBlockedIndexedDB(async () => {
      const { idb } = await loadDbModule();
      const posts = await idb.getAll("posts");
      expect(posts).toEqual([]);
    });
  });

  it("get resolves to undefined when indexedDB access throws", async () => {
    await withBlockedIndexedDB(async () => {
      const { idb } = await loadDbModule();
      const post = await idb.get("posts", "demo-post-1");
      expect(post).toBeUndefined();
    });
  });

  it("getAllByIndex resolves to [] when indexedDB access throws", async () => {
    await withBlockedIndexedDB(async () => {
      const { idb } = await loadDbModule();
      const nodes = await idb.getAllByIndex("nodes", "brain_id", "b1");
      expect(nodes).toEqual([]);
    });
  });

  it("put / putAll / delete resolve (no-ops) when indexedDB access throws", async () => {
    await withBlockedIndexedDB(async () => {
      const { idb } = await loadDbModule();
      await expect(idb.put("posts", { id: "p1" })).resolves.toBeUndefined();
      await expect(idb.putAll("posts", [{ id: "p1" }, { id: "p2" }])).resolves.toBeUndefined();
      await expect(idb.delete("posts", "p1")).resolves.toBeUndefined();
      await expect(idb.clear("posts")).resolves.toBeUndefined();
      await expect(idb.clearAll()).resolves.toBeUndefined();
      await expect(idb.deleteAll("posts", ["p1"])).resolves.toBeUndefined();
    });
  });

  it("storeNames resolves to [] when indexedDB access throws", async () => {
    await withBlockedIndexedDB(async () => {
      const { idb } = await loadDbModule();
      const names = await idb.storeNames();
      expect(names).toEqual([]);
    });
  });

  it("logs the blocked-storage warning exactly ONCE per session (not per call)", async () => {
    await withBlockedIndexedDB(async () => {
      const { idb } = await loadDbModule();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await idb.getAll("posts");
      await idb.getAll("posts");
      await idb.get("posts", "x");
      await idb.put("posts", { id: "y" });
      const blockedWarnings = warn.mock.calls.filter((c) =>
        String(c[0]).includes("Local storage is blocked"),
      );
      expect(blockedWarnings.length).toBe(1);
    });
  });

  it("non-access errors still REJECT (genuine bugs must surface)", async () => {
    // Simulate a DB that OPENS but fails the transaction with a real error
    // (not a storage-access error) — e.g. a missing object store.
    const original = globalThis.indexedDB;
    const fakeDB = {
      objectStoreNames: { contains: () => false },
      transaction: () => {
        throw new DOMException("NotFoundError: store missing", "NotFoundError");
      },
      close: () => {},
    } as unknown as IDBDatabase;
    const fakeFactory = {
      open: () => {
        const req = {
          onerror: null as unknown,
          onsuccess: null as unknown,
          onupgradeneeded: null as unknown,
          result: fakeDB,
          error: null,
        } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => {
          if (typeof req.onsuccess === "function") {
            (req.onsuccess as (e: unknown) => void).call(req, { target: req });
          }
        });
        return req;
      },
    };
    Object.defineProperty(globalThis, "indexedDB", {
      value: fakeFactory,
      writable: true,
      configurable: true,
    });

    try {
      const { idb } = await loadDbModule();
      await expect(idb.getAll("posts")).rejects.toThrow();
    } finally {
      Object.defineProperty(globalThis, "indexedDB", {
        value: original,
        writable: true,
        configurable: true,
      });
      vi.resetModules();
    }
  });
});
