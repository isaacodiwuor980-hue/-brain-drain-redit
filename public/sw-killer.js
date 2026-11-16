/*!
 * Brain Drain — SW-killer (synchronous, external file).
 *
 * Loaded synchronously from index.html <head> BEFORE the main module script.
 * The CSP `script-src 'self'` allows this file (same-origin) but blocks
 * inline scripts — moving the killer here fixes the CSP violation that
 * previously silently disabled it in strict-CSP browsers.
 *
 * Why: the old async SW-killer let the browser start loading JS chunks
 * before the SW was unregistered. The SW served stale cached chunks
 * → version mismatch → blank page.
 *
 * This version is SYNCHRONOUS: if a SW is controlling this page
 * (navigator.serviceWorker.controller is truthy), we IMMEDIATELY redirect
 * with ?swfresh=1 BEFORE the parser reaches the <script type="module"> tag.
 * The redirect cancels all pending resource loads, so no stale chunks
 * can be served. On the redirected load, the SW is gone (unregistered
 * in the background) and the browser fetches fresh HTML + assets directly.
 */
(function () {
  try {
    // SYNCHRONOUS check: is a SW controlling this page RIGHT NOW?
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      // A SW is active. Redirect immediately with cache-busting param.
      if (location.search.indexOf("swfresh=1") === -1) {
        var sep = location.search ? "&" : "?";
        // Use location.replace so the broken page doesn't stay in history.
        location.replace(location.pathname + location.search + sep + "swfresh=1" + location.hash);
        // STOP execution — the page is about to reload.
        return;
      }
      // If we already have ?swfresh=1 but a SW is STILL controlling
      // (shouldn't happen, but just in case), unregister it NOW.
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      }).then(function () {
        // Clear all caches so no stale assets survive.
        if ("caches" in window) {
          return caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
          });
        }
      }).catch(function () {});
    } else {
      // No SW controlling. Clean up any orphaned registrations + caches
      // in the background (non-blocking).
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        }).catch(function () {});
      }
      if ("caches" in window) {
        caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }).catch(function () {});
      }
    }
  } catch { /* never let this script throw */ }
})();
