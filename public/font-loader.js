/**
 * Brain Drain — font loader (external, CSP-compliant).
 *
 * Why an external file: index.html previously used the classic
 * `<link media="print" onload="this.media='all'">` async-CSS trick, but the
 * strict CSP (`script-src 'self'`) BLOCKS inline event handlers, so the
 * onload never fired → the stylesheet stayed media="print" → Google Fonts
 * never actually applied (and every page load logged a CSP violation).
 *
 * This script replicates the same non-blocking behavior: the stylesheet
 * link is injected by JS after first paint, so it never blocks rendering,
 * and font-display=swap on the Google Fonts side avoids FOIT.
 */
(function () {
  try {
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Roboto:wght@400;500;600;700;800&display=swap";
    l.crossOrigin = "anonymous";
    document.head.appendChild(l);
  } catch { /* never block the app over fonts */ }
})();
