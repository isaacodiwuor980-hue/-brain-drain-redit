/**
 * Service-worker cleanup — safe to run in ANY context.
 *
 * WHY THE EXTRA GUARD (regression: preview blank-screen crash):
 * In sandboxed iframes (`sandbox="allow-scripts"` WITHOUT `allow-same-origin`,
 * i.e. an opaque origin — the strictest embedder configuration) and some
 * privacy modes, merely READING the `navigator.serviceWorker` property throws
 * `SecurityError: ... Service worker is disabled because the context is
 * sandboxed and lacks the 'allow-same-origin' flag.`
 *
 * `"serviceWorker" in navigator` does NOT protect against this: the `in`
 * operator returns true even where the property read throws. And a
 * synchronous throw inside a React passive effect unmounts the entire
 * component tree — the app rendered a blank home screen and never issued a
 * single /api/feed request (reproduced via scripts/iframe-sandbox-opaque.cjs;
 * see commit that introduced this helper).
 *
 * Rule for this module: it must never throw and never leave an unhandled
 * rejection, regardless of how hostile the embedding context is.
 */

/** Read navigator.serviceWorker without tripping context-level SecurityError. */
function getServiceWorker(): ServiceWorkerContainer | undefined {
  try {
    // The property READ itself can throw (sandboxed/opaque origin).
    const sw = (navigator as Navigator).serviceWorker;
    return sw ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Unregister every service worker for this origin.
 *
 * The app no longer ships a service worker (sw-killer actively removes stale
 * ones); this cleanup only clears leftovers from older deployments. Safe to
 * call unconditionally from app bootstrap.
 */
export function unregisterStaleServiceWorkers(): void {
  try {
    if (typeof navigator === "undefined") return;
    const sw = getServiceWorker();
    if (!sw || typeof sw.getRegistrations !== "function") return;
    sw.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .then(() => {
        console.log("[preview] unregistered stale service workers");
      })
      .catch(() => {
        // Unregistering is best-effort; failures must never surface.
      });
  } catch {
    // Never let SW cleanup break app bootstrap (see module docstring).
  }
}
