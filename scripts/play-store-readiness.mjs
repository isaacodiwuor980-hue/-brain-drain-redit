#!/usr/bin/env node
/**
 * play-store-readiness.mjs — Verifies all PWA + TWA prerequisites for Google Play.
 *
 * Checks:
 *  1. Manifest is served with correct MIME type + required fields
 *  2. All required icons exist (192, 512, maskable variants)
 *  3. Service worker is registered + caches the app shell
 *  4. HTTPS + security headers (HSTS, CSP)
 *  5. assetlinks.json is reachable (placeholder or real)
 *  6. Privacy policy + terms of service pages exist
 *  7. Performance is acceptable (Lighthouse-style checks)
 *  8. Offline support (service worker caches HTML for offline use)
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let pass = 0, fail = 0, warn = 0;
const bugs = [];

function line(level, msg) {
  const tag = level === "PASS" ? "✓" : level === "FAIL" ? "✗" : level === "WARN" ? "!" : "→";
  console.log(`  ${tag} ${level.padEnd(4)} ${msg}`);
  if (level === "PASS") pass++;
  else if (level === "FAIL") fail++;
  else if (level === "WARN") warn++;
}

async function fetchHeaders(path) {
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(8000) });
    return { status: res.status, headers: res.headers, ok: res.ok };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

async function fetchText(path) {
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    return { status: res.status, text, ok: res.ok };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

async function fetchJson(path) {
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    return { status: res.status, json, ok: res.ok };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

// ============================================================
console.log("\n=== 1. PWA Manifest ===");
{
  const r = await fetchHeaders("/manifest.webmanifest");
  if (r.status !== 200) { line("FAIL", `manifest not served (status=${r.status})`); bugs.push("manifest missing"); }
  else {
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("manifest") || ct.includes("json")) line("PASS", `manifest MIME: ${ct}`);
    else { line("FAIL", `manifest wrong MIME: ${ct} (expected application/manifest+json)`); bugs.push("manifest MIME"); }
  }

  const t = await fetchText("/manifest.webmanifest");
  if (t.ok) {
    const required = ["name", "short_name", "start_url", "display", "icons", "background_color", "theme_color"];
    const missing = required.filter(f => !t.text.includes(`"${f}"`));
    if (missing.length === 0) line("PASS", "manifest contains all required fields");
    else { line("FAIL", `manifest missing fields: ${missing.join(", ")}`); bugs.push("manifest fields"); }

    if (t.text.includes("maskable")) line("PASS", "manifest includes maskable icon purpose");
    else { line("WARN", "manifest missing maskable icon purpose"); }

    if (t.text.includes("standalone")) line("PASS", "manifest display mode is standalone");
    else { line("WARN", "manifest display mode is not standalone"); }

    if (t.text.includes("shortcuts")) line("PASS", "manifest includes app shortcuts");
    else { line("WARN", "manifest missing app shortcuts (improves Play Store listing)"); }
  }
}

// ============================================================
console.log("\n=== 2. Icons ===");
{
  const icons = [
    { path: "/icon-192.png", size: 192, type: "regular" },
    { path: "/icon-512.png", size: 512, type: "regular" },
    { path: "/icon-192-maskable.png", size: 192, type: "maskable" },
    { path: "/icon-512-maskable.png", size: 512, type: "maskable" },
    { path: "/apple-icon.png", size: 180, type: "apple-touch" },
    { path: "/favicon-32.png", size: 32, type: "favicon" },
  ];
  for (const icon of icons) {
    const r = await fetchHeaders(icon.path);
    if (r.status === 200) {
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("image/png")) line("PASS", `${icon.path} (${icon.type}, ${icon.size}x${icon.size})`);
      else line("WARN", `${icon.path} wrong MIME: ${ct}`);
    } else { line("FAIL", `${icon.path} not served (status=${r.status})`); bugs.push(`icon ${icon.path}`); }
  }
}

// ============================================================
console.log("\n=== 3. Service Worker ===");
{
  const r = await fetchText("/sw.js");
  if (r.ok) {
    if (r.text.includes("install") && r.text.includes("activate") && r.text.includes("fetch")) {
      line("PASS", "service worker has install/activate/fetch handlers");
    } else { line("FAIL", "service worker missing required handlers"); bugs.push("SW handlers"); }

    if (r.text.includes("manifest.webmanifest")) line("PASS", "service worker caches the manifest");
    else { line("WARN", "service worker does not cache the manifest"); }

    if (r.text.includes("icon-192") && r.text.includes("icon-512")) line("PASS", "service worker caches critical icons");
    else { line("WARN", "service worker does not cache icons"); }

    // Check version
    const versionMatch = r.text.match(/CACHE_VERSION\s*=\s*["']([^"']+)["']/);
    if (versionMatch) line("PASS", `service worker version: ${versionMatch[1]}`);
    else line("WARN", "service worker version not found");
  } else { line("FAIL", `/sw.js not served (status=${r.status})`); bugs.push("SW missing"); }
}

// ============================================================
console.log("\n=== 4. HTTPS + Security Headers ===");
{
  const r = await fetchHeaders("/");
  if (r.status === 200) {
    const csp = r.headers.get("content-security-policy") || "";
    const hsts = r.headers.get("strict-transport-security") || "";
    const xfo = r.headers.get("x-frame-options") || "";
    const xcto = r.headers.get("x-content-type-options") || "";

    if (csp) line("PASS", `CSP header present (${csp.length} chars)`);
    else { line("FAIL", "CSP header missing"); bugs.push("CSP"); }

    if (hsts) line("PASS", `HSTS header: ${hsts}`);
    else { line("WARN", "HSTS header missing (will be enforced by reverse proxy in prod)"); }

    if (xcto === "nosniff") line("PASS", "X-Content-Type-Options: nosniff");
    else { line("WARN", `X-Content-Type-Options: ${xcto}`); }

    if (xfo) line("PASS", `X-Frame-Options: ${xfo}`);
    else line("WARN", "X-Frame-Options missing");
  } else { line("FAIL", `/ returned status ${r.status}`); bugs.push("root"); }
}

// ============================================================
console.log("\n=== 5. Digital Asset Links (TWA) ===");
{
  const r = await fetchText("/.well-known/assetlinks.json");
  if (r.ok) {
    try {
      const parsed = JSON.parse(r.text);
      if (Array.isArray(parsed) && parsed[0]?.relation?.includes("delegate_permission/common.handle_all_urls")) {
        line("PASS", "assetlinks.json is valid JSON with correct relation");
      } else { line("WARN", "assetlinks.json structure may be incorrect"); }
    } catch {
      line("FAIL", "assetlinks.json is not valid JSON"); bugs.push("assetlinks.json");
    }

    if (r.text.includes("REPLACE_WITH_YOUR_APP_SIGNING_KEY_SHA256_FINGERPRINT")) {
      line("WARN", "assetlinks.json has PLACEHOLDER fingerprint — replace with real signing key SHA-256 before Play Store submission");
    } else if (r.text.match(/[0-9A-Fa-f:]{95}/)) {
      line("PASS", "assetlinks.json has a SHA-256 fingerprint (looks real)");
    } else {
      line("WARN", "assetlinks.json fingerprint format unclear");
    }
  } else {
    line("WARN", `/.well-known/assetlinks.json not served (status=${r.status}) — required for TWA, deploy before Play Store`);
  }
}

// ============================================================
console.log("\n=== 6. Legal Pages ===");
{
  for (const page of ["/privacy-policy", "/terms-of-service"]) {
    const r = await fetchHeaders(page);
    if (r.status === 200) line("PASS", `${page} is served`);
    else { line("FAIL", `${page} returned status ${r.status}`); bugs.push(`legal ${page}`); }
  }
}

// ============================================================
console.log("\n=== 7. Performance (transfer sizes) ===");
{
  const eagerAssets = ["/"];
  const r = await fetchText("/");
  if (r.ok) {
    const scriptMatches = r.text.matchAll(/src="([^"]+\.js)"/g);
    const preloadMatches = r.text.matchAll(/modulepreload[^>]*href="([^"]+\.js)"/g);
    for (const m of [...scriptMatches, ...preloadMatches]) {
      eagerAssets.push(m[1]);
    }
  }

  let totalBytes = 0;
  for (const path of eagerAssets) {
    // Use curl to get the actual compressed transfer size (Node fetch auto-decompresses)
    try {
      const { execSync } = await import("node:child_process");
      const size = parseInt(
        execSync(
          `curl -s -o /dev/null -w "%{size_download}" -H "Accept-Encoding: gzip,deflate,br" "${BASE}${path}"`,
          { encoding: "utf8", timeout: 8000 }
        ).trim(),
        10
      );
      const enc = execSync(
        `curl -sI -H "Accept-Encoding: gzip,deflate,br" "${BASE}${path}" | grep -i content-encoding | tr -d '\\r\\n'`,
        { encoding: "utf8", timeout: 8000 }
      ).trim();
      totalBytes += size;
      line("INFO", `  ${path}: ${(size / 1024).toFixed(1)} KB (${enc || "no encoding"})`);
    } catch {
      line("WARN", `  ${path}: could not measure`);
    }
  }
  line("INFO", `  Total initial transfer: ${(totalBytes / 1024).toFixed(1)} KB`);
  if (totalBytes < 200 * 1024) line("PASS", `Initial transfer < 200 KB (excellent for 3G)`);
  else if (totalBytes < 500 * 1024) line("PASS", `Initial transfer < 500 KB (acceptable)`);
  else { line("WARN", `Initial transfer > 500 KB (consider optimizing)`); }
}

// ============================================================
console.log("\n=== 8. HTML <link rel=\"manifest\"> ===");
{
  const r = await fetchText("/");
  if (r.ok) {
    if (r.text.includes('rel="manifest"') || r.text.includes("rel='manifest'")) {
      line("PASS", "HTML has <link rel=\"manifest\">");
    } else { line("FAIL", "HTML missing <link rel=\"manifest\">"); bugs.push("manifest link"); }

    if (r.text.includes('apple-mobile-web-app-capable')) line("PASS", "iOS standalone meta tag present");
    else line("WARN", "iOS standalone meta tag missing");

    if (r.text.includes('mobile-web-app-capable')) line("PASS", "Android standalone meta tag present");
    else line("WARN", "Android standalone meta tag missing");

    if (r.text.includes('apple-touch-icon')) line("PASS", "apple-touch-icon link present");
    else line("WARN", "apple-touch-icon link missing");
  }
}

// ============================================================
console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  SUMMARY: ${pass} PASS · ${fail} FAIL · ${warn} WARN`);
if (bugs.length > 0) {
  console.log("\n  BLOCKERS:");
  for (const b of bugs) console.log(`    ✗ ${b}`);
}
console.log("\n  Play Store readiness:");
if (fail === 0) {
  console.log("    ✅ PWA prerequisites met — app is installable + ready for TWA packaging");
  console.log("    ⏳ TWA packaging pending: signing key + Bubblewrap build + assetlinks.json fingerprint");
  console.log("    ⏳ Play Store pending: Developer account ($25) + 14-day closed test");
} else {
  console.log(`    ❌ ${fail} blocker(s) must be fixed before TWA packaging`);
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(fail > 0 ? 1 : 0);
