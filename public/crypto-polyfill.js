/* crypto.randomUUID polyfill — permanent cross-browser fix.
 *
 * WHY THIS EXISTS:
 *   crypto.randomUUID() requires a SECURE CONTEXT (HTTPS or localhost).
 *   On HTTP preview domains, Chrome / Opera / Safari leave the method
 *   undefined; any code that calls it (feed cold-start seeding, analytics
 *   trackEvent, share-as-post, mind creation, comment ids) throws a
 *   TypeError and the feed never renders. Firefox is more lenient in some
 *   versions, which is exactly why the feed loaded in Firefox but failed in
 *   Chrome and Opera Mini.
 *
 *   This file is loaded SYNCHRONOUSLY in <head> (right after /sw-killer.js),
 *   BEFORE the app module bundle at the bottom of <body> evaluates — so the
 *   polyfill is in place before any app code runs. It is a no-op where the
 *   native method already exists (HTTPS / localhost).
 *
 *   crypto.getRandomValues is available in ALL contexts (secure AND insecure)
 *   and is cryptographically strong, so the fallback is equivalent to the
 *   native method. The only browser with no getRandomValues is Opera Mini in
 *   "Extreme" data-savings mode — which strips JS entirely, so nothing
 *   client-side can run there; users on Opera Mini should switch to the
 *   "High" / "Data savings" mode or any Chromium/Firefox browser.
 */
(function () {
  try {
    if (typeof crypto === "undefined") {
      window.crypto = {};
    }
    if (typeof crypto.randomUUID === "function") {
      return; // native method present (secure context) — nothing to do
    }

    crypto.randomUUID = function uuidv4() {
      // Preferred path — cryptographically strong, available everywhere
      // a secure context is NOT required.
      if (typeof crypto.getRandomValues === "function") {
        var b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40; // version 4
        b[8] = (b[8] & 0x3f) | 0x80; // variant 10 (RFC 4122)
        var h = [];
        for (var i = 0; i < 16; i++) {
          h.push(b[i].toString(16).padStart(2, "0"));
        }
        return (
          h.slice(0, 4).join("") + "-" +
          h.slice(4, 6).join("") + "-" +
          h.slice(6, 8).join("") + "-" +
          h.slice(8, 10).join("") + "-" +
          h.slice(10, 16).join("")
        );
      }
      // Last-resort fallback for browsers without getRandomValues
      // (very old / locked-down webviews). Math.random is not crypto-strong
      // but produces a valid RFC-4122 v4 shape so app code never throws.
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
    };
  } catch {
    // Never let the polyfill itself block page load. If it throws in a
    // locked-down browser, the app's own error monitor will surface the
    // problem; swallowing here keeps the <head> parse alive.
  }
})();
