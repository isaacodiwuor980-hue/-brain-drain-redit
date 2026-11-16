/**
 * Regression guards for the sandboxed-iframe SW crash (Phase 3 preview fix).
 *
 * Failure mode being guarded: in a sandboxed iframe with an opaque origin
 * (`sandbox="allow-scripts"` without `allow-same-origin`), READING the
 * `navigator.serviceWorker` property throws SecurityError. The pre-fix code
 * in App.tsx read it unguarded inside a mount effect → the synchronous throw
 * unmounted the whole React tree → blank home screen, zero /api/feed calls
 * (reproduced with scripts/iframe-sandbox-opaque.cjs before the fix).
 *
 * These tests simulate the hostile context by defining a throwing getter for
 * globalThis.navigator.serviceWorker — mirroring real browser behavior where
 * the property ACCESS throws (the `"serviceWorker" in navigator` check still
 * returns true there, which is exactly why it was insufficient).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

function makeThrowingNavigator(): Navigator {
  // Keep `in` true (like real sandboxed contexts) but make the READ throw.
  const fake = {
    get serviceWorker() {
      throw new DOMException(
        "Failed to read the 'serviceWorker' property from 'Navigator': Service worker is disabled because the context is sandboxed and lacks the 'allow-same-origin' flag.",
        "SecurityError",
      );
    },
  };
  return fake as unknown as Navigator;
}

function installNavigator(n: Navigator | undefined): void {
  Object.defineProperty(globalThis, "navigator", {
    get: () => {
      if (n === undefined) {
        throw new Error("navigator removed");
      }
      return n;
    },
    configurable: true,
  });
}

let originalDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  vi.restoreAllMocks();
});

afterEach(() => {
  if (originalDescriptor) {
    Object.defineProperty(globalThis, "navigator", originalDescriptor);
  }
  vi.resetModules();
});

/** The PRE-FIX logic, copied verbatim from App.tsx before the change. */
function preFixInlineEffect(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker // ← throws synchronously in sandboxed contexts
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .then(() => console.log("[preview] unregistered stale service workers"))
    .catch(() => {});
}

describe("sw-cleanup (sandboxed opaque-origin iframe)", () => {
  it("documents the fails-before behavior: pre-fix inline effect throws SecurityError on property read", () => {
    installNavigator(makeThrowingNavigator());
    // `"serviceWorker" in navigator` is still true (mirrors real browsers)…
    expect("serviceWorker" in navigator).toBe(true);
    // …so the pre-fix effect crashes with exactly this error class.
    expect(() => preFixInlineEffect()).toThrow(DOMException);
    expect(() => preFixInlineEffect()).toThrow(/sandboxed/);
  });

  it("passes-after: helper does NOT throw when navigator.serviceWorker access throws", async () => {
    installNavigator(makeThrowingNavigator());
    const { unregisterStaleServiceWorkers } = await import("./sw-cleanup");
    expect(() => unregisterStaleServiceWorkers()).not.toThrow();
    // Let any stray microtasks settle; a crash would fail the test run.
    await new Promise((r) => setTimeout(r, 10));
  });

  it("passes-after: normal context still unregisters workers and logs the preview message", async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi
      .fn()
      .mockResolvedValue([{ unregister }, { unregister }]);
    const swContainer = { getRegistrations } as unknown as ServiceWorkerContainer;
    const nav = { serviceWorker: swContainer } as unknown as Navigator;
    installNavigator(nav);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { unregisterStaleServiceWorkers } = await import("./sw-cleanup");
    expect(() => unregisterStaleServiceWorkers()).not.toThrow();

    await new Promise((r) => setTimeout(r, 10));
    expect(getRegistrations).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith("[preview] unregistered stale service workers");
  });

  it("passes-after: getRegistrations rejection is swallowed (no unhandled rejection)", async () => {
    const getRegistrations = vi.fn().mockRejectedValue(new Error("boom"));
    const nav = {
      serviceWorker: { getRegistrations },
    } as unknown as Navigator;
    installNavigator(nav);

    const { unregisterStaleServiceWorkers } = await import("./sw-cleanup");
    expect(() => unregisterStaleServiceWorkers()).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(getRegistrations).toHaveBeenCalledTimes(1);
  });

  it("passes-after: navigator without serviceWorker (or undefined) is a safe no-op", async () => {
    installNavigator({} as Navigator);
    const mod1 = await import("./sw-cleanup");
    expect(() => mod1.unregisterStaleServiceWorkers()).not.toThrow();

    installNavigator(undefined);
    vi.resetModules();
    const mod2 = await import("./sw-cleanup");
    expect(() => mod2.unregisterStaleServiceWorkers()).not.toThrow();
  });
});
