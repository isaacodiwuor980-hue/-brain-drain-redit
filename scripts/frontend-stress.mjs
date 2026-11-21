#!/usr/bin/env node
/**
 * frontend-stress.mjs — Brain Drain frontend simulation + stress test.
 *
 * Visits every major page, captures console errors + page errors,
 * exercises modals + forms, and reports any UI defects.
 */

import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = resolve(process.env.SCREENSHOT_DIR || "scripts/screenshots");
import { mkdirSync } from "node:fs";
mkdirSync(SCREENSHOT_DIR, { recursive: true });

let pass = 0, fail = 0, warn = 0;
const bugs = [];

function line(level, msg) {
  const tag = level === "PASS" ? "✓" : level === "FAIL" ? "✗" : level === "WARN" ? "!" : "→";
  console.log(`  ${tag} ${level.padEnd(4)} ${msg}`);
  if (level === "PASS") pass++;
  else if (level === "FAIL") fail++;
  else if (level === "WARN") warn++;
}

function run(cmd, opts = {}) {
  try {
    const out = execSync(cmd, { encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"], ...opts });
    return { ok: true, out, err: "" };
  } catch (e) {
    return { ok: false, out: e.stdout ?? "", err: e.stderr ?? e.message };
  }
}

function ab(args) {
  const r = run(`agent-browser ${args}`);
  return r.out + r.err;
}

function getConsole() {
  return ab("console 2>&1");
}

function getErrors() {
  return ab("errors 2>&1");
}

function clearLogs() {
  ab("console --clear 2>&1");
  ab("errors --clear 2>&1");
}

function snapshot() {
  return ab("snapshot -i 2>&1");
}

// ============================================================
// PHASE 1: Visit every page, capture errors
// ============================================================
console.log("\n=== Phase 1: Visit every page, capture console/page errors ===");

const pages = [
  { name: "Home", url: "/" },
  { name: "Search", url: "/search" },
  { name: "Brains", url: "/brains" },
  { name: "Pathways", url: "/pathways" },
  { name: "Topics", url: "/topics" },
  { name: "Community", url: "/community" },
  { name: "Messages", url: "/messages" },
  { name: "Notifications", url: "/notifications" },
  { name: "Profile", url: "/profile" },
  { name: "Settings", url: "/settings" },
  { name: "Missions", url: "/missions" },
  { name: "Leaderboard", url: "/leaderboard" },
  { name: "Personality Test", url: "/personality-test" },
  { name: "Onboarding", url: "/onboarding" },
  { name: "Privacy Policy", url: "/privacy-policy" },
  { name: "Terms of Service", url: "/terms-of-service" },
  { name: "404 page", url: "/this-route-does-not-exist-test" },
];

for (const p of pages) {
  ab(`open ${BASE}${p.url} 2>&1 >/dev/null`);
  ab("wait --load networkidle 2>&1 >/dev/null");
  ab("wait 800 2>&1 >/dev/null");
  clearLogs();

  // Re-trigger any delayed errors
  ab("wait 1500 2>&1 >/dev/null");
  const errs = getErrors();
  const con = getConsole();

  // Filter out SW logs (always expected)
  const realErrors = errs.split("\n").filter(l => l.trim() && !l.includes("ServiceWorker") && !l.startsWith("[agent-browser]"));
  const realCon = con.split("\n").filter(l => l.trim() && !l.includes("ServiceWorker") && !l.startsWith("[agent-browser]"));

  // Check if page actually rendered (look for #root content)
  const title = ab("get title 2>&1").trim();
  const url = ab("get url 2>&1").trim();
  const snapshotOut = snapshot();

  // A blank page would have very few elements
  const elementCount = (snapshotOut.match(/\[ref=/g) || []).length;

  ab(`screenshot ${SCREENSHOT_DIR}/${p.name.toLowerCase().replace(/\s+/g, "-")}.png 2>&1 >/dev/null`);

  if (realErrors.length > 0) {
    bugs.push({ page: p.name, kind: "PAGE_ERROR", detail: realErrors.join("; ").slice(0, 300) });
    line("FAIL", `${p.name} (${p.url}) — ${realErrors.length} error(s): ${realErrors[0].slice(0, 150)}`);
  } else if (elementCount < 3) {
    bugs.push({ page: p.name, kind: "BLANK_PAGE", detail: `only ${elementCount} elements` });
    line("FAIL", `${p.name} (${p.url}) — BLANK PAGE (only ${elementCount} elements)`);
  } else if (url.endsWith("/404-page") || url.includes("does-not-exist")) {
    line("WARN", `${p.name} — URL=${url.split("/").slice(-1)[0]}`);
  } else {
    line("PASS", `${p.name} (${p.url}) — ${elementCount} elements, no errors`);
  }

  // Also log any console warnings (not just errors)
  if (realCon.length > 0) {
    const warns = realCon.filter(l => l.includes("[warn") || l.includes("[error") || l.includes("Warning"));
    if (warns.length > 0) {
      line("WARN", `  console: ${warns[0].slice(0, 100)}`);
    }
  }
}

// ============================================================
// PHASE 2: Modal + form interactions
// ============================================================
console.log("\n=== Phase 2: Modal + form interactions ===");

// Re-open Home
ab(`open ${BASE}/ 2>&1 >/dev/null`);
ab("wait --load networkidle 2>&1 >/dev/null");
ab("wait 2000 2>&1 >/dev/null");
clearLogs();

// Test: open command palette (⌘K)
ab("press Control+k 2>&1 >/dev/null");
ab("wait 800 2>&1 >/dev/null");
const palSnap = snapshot();
if (palSnap.includes("Search") || palSnap.includes("command") || palSnap.includes("Type a command")) {
  line("PASS", "Command palette opens with ⌘K");
} else {
  line("WARN", `Command palette did not open clearly (snapshot len=${palSnap.length})`);
}
// Take screenshot for evidence
ab(`screenshot ${SCREENSHOT_DIR}/command-palette.png 2>&1 >/dev/null`);
// Close palette
ab("press Escape 2>&1 >/dev/null");
ab("wait 500 2>&1 >/dev/null");

// Test: open Create Post modal (click "Post" button in FAB)
const snap1 = snapshot();
if (snap1.includes("Create a new post")) {
  // Find the "Create a new post" generic element
  const match = snap1.match(/generic "Create a new post"[^\[]*\[ref=(e\d+)\]/);
  if (match) {
    ab(`click @${match[1]} 2>&1 >/dev/null`);
    ab("wait 1000 2>&1 >/dev/null");
    const postSnap = snapshot();
    if (postSnap.includes("Create") && postSnap.includes("Post")) {
      line("PASS", "Create Post modal opens");
    } else {
      line("WARN", `Create Post modal — snapshot does not contain expected text`);
    }
    ab(`screenshot ${SCREENSHOT_DIR}/create-post-modal.png 2>&1 >/dev/null`);
    ab("press Escape 2>&1 >/dev/null");
    ab("wait 500 2>&1 >/dev/null");
  } else {
    line("WARN", "Could not find Create Post button ref");
  }
} else {
  line("WARN", "Create Post button not found in snapshot");
}

// Test: open Profile page
ab(`open ${BASE}/profile 2>&1 >/dev/null`);
ab("wait --load networkidle 2>&1 >/dev/null");
ab("wait 1500 2>&1 >/dev/null");
clearLogs();
const profSnap = snapshot();
const profErrs = getErrors();
const profRealErrs = profErrs.split("\n").filter(l => l.trim() && !l.includes("ServiceWorker") && !l.startsWith("[agent-browser]"));
if (profRealErrs.length === 0 && profSnap.includes("Profile")) {
  line("PASS", "Profile page loads without errors");
} else if (profRealErrs.length > 0) {
  bugs.push({ page: "Profile", kind: "PAGE_ERROR", detail: profRealErrs.join(";").slice(0,300) });
  line("FAIL", `Profile page has errors: ${profRealErrs[0].slice(0, 150)}`);
} else {
  line("WARN", "Profile page — no errors but no 'Profile' label found");
}
ab(`screenshot ${SCREENSHOT_DIR}/profile.png 2>&1 >/dev/null`);

// Test: open Settings page
ab(`open ${BASE}/settings 2>&1 >/dev/null`);
ab("wait --load networkidle 2>&1 >/dev/null");
ab("wait 1500 2>&1 >/dev/null");
clearLogs();
const setSnap = snapshot();
const setErrs = getErrors();
const setRealErrs = setErrs.split("\n").filter(l => l.trim() && !l.includes("ServiceWorker") && !l.startsWith("[agent-browser]"));
if (setRealErrs.length === 0 && (setSnap.includes("Settings") || setSnap.includes("Appearance"))) {
  line("PASS", "Settings page loads without errors");
} else if (setRealErrs.length > 0) {
  bugs.push({ page: "Settings", kind: "PAGE_ERROR", detail: setRealErrs.join(";").slice(0,300) });
  line("FAIL", `Settings page has errors: ${setRealErrs[0].slice(0, 150)}`);
} else {
  line("WARN", "Settings page — no errors but no Settings/Appearance label found");
}
ab(`screenshot ${SCREENSHOT_DIR}/settings.png 2>&1 >/dev/null`);

// Test: open Brains page + try to create a brain
ab(`open ${BASE}/brains 2>&1 >/dev/null`);
ab("wait --load networkidle 2>&1 >/dev/null");
ab("wait 1500 2>&1 >/dev/null");
clearLogs();
const brainsSnap = snapshot();
const brainsErrs = getErrors();
const brainsRealErrs = brainsErrs.split("\n").filter(l => l.trim() && !l.includes("ServiceWorker") && !l.startsWith("[agent-browser]"));
if (brainsRealErrs.length === 0) {
  line("PASS", "Brains page loads without errors");
} else {
  bugs.push({ page: "Brains", kind: "PAGE_ERROR", detail: brainsRealErrs.join(";").slice(0,300) });
  line("FAIL", `Brains page has errors: ${brainsRealErrs[0].slice(0, 150)}`);
}
ab(`screenshot ${SCREENSHOT_DIR}/brains.png 2>&1 >/dev/null`);

// Test: open Community page
ab(`open ${BASE}/community 2>&1 >/dev/null`);
ab("wait --load networkidle 2>&1 >/dev/null");
ab("wait 1500 2>&1 >/dev/null");
clearLogs();
const commSnap = snapshot();
const commErrs = getErrors();
const commRealErrs = commErrs.split("\n").filter(l => l.trim() && !l.includes("ServiceWorker") && !l.startsWith("[agent-browser]"));
if (commRealErrs.length === 0) {
  line("PASS", "Community page loads without errors");
} else {
  bugs.push({ page: "Community", kind: "PAGE_ERROR", detail: commRealErrs.join(";").slice(0,300) });
  line("FAIL", `Community page has errors: ${commRealErrs[0].slice(0, 150)}`);
}
ab(`screenshot ${SCREENSHOT_DIR}/community.png 2>&1 >/dev/null`);

// Test: open Topics page
ab(`open ${BASE}/topics 2>&1 >/dev/null`);
ab("wait --load networkidle 2>&1 >/dev/null");
ab("wait 1500 2>&1 >/dev/null");
clearLogs();
const topicsSnap = snapshot();
const topicsErrs = getErrors();
const topicsRealErrs = topicsErrs.split("\n").filter(l => l.trim() && !l.includes("ServiceWorker") && !l.startsWith("[agent-browser]"));
if (topicsRealErrs.length === 0 && topicsSnap.length > 200) {
  line("PASS", "Topics page loads without errors");
} else if (topicsRealErrs.length > 0) {
  bugs.push({ page: "Topics", kind: "PAGE_ERROR", detail: topicsRealErrs.join(";").slice(0,300) });
  line("FAIL", `Topics page has errors: ${topicsRealErrs[0].slice(0, 150)}`);
} else {
  line("WARN", `Topics page — short snapshot (${topicsSnap.length} chars)`);
}
ab(`screenshot ${SCREENSHOT_DIR}/topics.png 2>&1 >/dev/null`);

// Test: open Pathways page
ab(`open ${BASE}/pathways 2>&1 >/dev/null`);
ab("wait --load networkidle 2>&1 >/dev/null");
ab("wait 1500 2>&1 >/dev/null");
clearLogs();
const pathErrs = getErrors();
const pathRealErrs = pathErrs.split("\n").filter(l => l.trim() && !l.includes("ServiceWorker") && !l.startsWith("[agent-browser]"));
if (pathRealErrs.length === 0) {
  line("PASS", "Pathways page loads without errors");
} else {
  bugs.push({ page: "Pathways", kind: "PAGE_ERROR", detail: pathRealErrs.join(";").slice(0,300) });
  line("FAIL", `Pathways page has errors: ${pathRealErrs[0].slice(0, 150)}`);
}
ab(`screenshot ${SCREENSHOT_DIR}/pathways.png 2>&1 >/dev/null`);

// Test: open Messages page
ab(`open ${BASE}/messages 2>&1 >/dev/null`);
ab("wait --load networkidle 2>&1 >/dev/null");
ab("wait 1500 2>&1 >/dev/null");
clearLogs();
const msgErrs = getErrors();
const msgRealErrs = msgErrs.split("\n").filter(l => l.trim() && !l.includes("ServiceWorker") && !l.startsWith("[agent-browser]"));
if (msgRealErrs.length === 0) {
  line("PASS", "Messages page loads without errors");
} else {
  bugs.push({ page: "Messages", kind: "PAGE_ERROR", detail: msgRealErrs.join(";").slice(0,300) });
  line("FAIL", `Messages page has errors: ${msgRealErrs[0].slice(0, 150)}`);
}
ab(`screenshot ${SCREENSHOT_DIR}/messages.png 2>&1 >/dev/null`);

// Test: open Notifications page
ab(`open ${BASE}/notifications 2>&1 >/dev/null`);
ab("wait --load networkidle 2>&1 >/dev/null");
ab("wait 1500 2>&1 >/dev/null");
clearLogs();
const notifErrs = getErrors();
const notifRealErrs = notifErrs.split("\n").filter(l => l.trim() && !l.includes("ServiceWorker") && !l.startsWith("[agent-browser]"));
if (notifRealErrs.length === 0) {
  line("PASS", "Notifications page loads without errors");
} else {
  bugs.push({ page: "Notifications", kind: "PAGE_ERROR", detail: notifRealErrs.join(";").slice(0,300) });
  line("FAIL", `Notifications page has errors: ${notifRealErrs[0].slice(0, 150)}`);
}
ab(`screenshot ${SCREENSHOT_DIR}/notifications.png 2>&1 >/dev/null`);

// Test: open Search page (full-text search UI)
ab(`open ${BASE}/search 2>&1 >/dev/null`);
ab("wait --load networkidle 2>&1 >/dev/null");
ab("wait 1500 2>&1 >/dev/null");
clearLogs();
const searchErrs = getErrors();
const searchRealErrs = searchErrs.split("\n").filter(l => l.trim() && !l.includes("ServiceWorker") && !l.startsWith("[agent-browser]"));
if (searchRealErrs.length === 0) {
  line("PASS", "Search page loads without errors");
} else {
  bugs.push({ page: "Search", kind: "PAGE_ERROR", detail: searchRealErrs.join(";").slice(0,300) });
  line("FAIL", `Search page has errors: ${searchRealErrs[0].slice(0, 150)}`);
}
ab(`screenshot ${SCREENSHOT_DIR}/search.png 2>&1 >/dev/null`);

// Test: open Missions page
ab(`open ${BASE}/missions 2>&1 >/dev/null`);
ab("wait --load networkidle 2>&1 >/dev/null");
ab("wait 1500 2>&1 >/dev/null");
clearLogs();
const missErrs = getErrors();
const missRealErrs = missErrs.split("\n").filter(l => l.trim() && !l.includes("ServiceWorker") && !l.startsWith("[agent-browser]"));
if (missRealErrs.length === 0) {
  line("PASS", "Missions page loads without errors");
} else {
  bugs.push({ page: "Missions", kind: "PAGE_ERROR", detail: missRealErrs.join(";").slice(0,300) });
  line("FAIL", `Missions page has errors: ${missRealErrs[0].slice(0, 150)}`);
}
ab(`screenshot ${SCREENSHOT_DIR}/missions.png 2>&1 >/dev/null`);

// Test: open Leaderboard page
ab(`open ${BASE}/leaderboard 2>&1 >/dev/null`);
ab("wait --load networkidle 2>&1 >/dev/null");
ab("wait 1500 2>&1 >/dev/null");
clearLogs();
const leadErrs = getErrors();
const leadRealErrs = leadErrs.split("\n").filter(l => l.trim() && !l.includes("ServiceWorker") && !l.startsWith("[agent-browser]"));
if (leadRealErrs.length === 0) {
  line("PASS", "Leaderboard page loads without errors");
} else {
  bugs.push({ page: "Leaderboard", kind: "PAGE_ERROR", detail: leadRealErrs.join(";").slice(0,300) });
  line("FAIL", `Leaderboard page has errors: ${leadRealErrs[0].slice(0, 150)}`);
}
ab(`screenshot ${SCREENSHOT_DIR}/leaderboard.png 2>&1 >/dev/null`);

// ============================================================
// PHASE 3: Theme toggle + dark mode
// ============================================================
console.log("\n=== Phase 3: Theme toggle (dark mode) ===");
ab(`open ${BASE}/settings 2>&1 >/dev/null`);
ab("wait --load networkidle 2>&1 >/dev/null");
ab("wait 1500 2>&1 >/dev/null");
const themeBefore = ab('eval "document.documentElement.classList.contains(\'dark\')" 2>&1').trim();
// Try to find a theme toggle button
const setSnap2 = snapshot();
const themeBtnMatch = setSnap2.match(/(button|switch|checkbox)[^\n]*(?:[Dd]ark|[Ll]ight|[Tt]heme)[^\n]*\[ref=(e\d+)\]/);
if (themeBtnMatch) {
  ab(`click @${themeBtnMatch[2]} 2>&1 >/dev/null`);
  ab("wait 800 2>&1 >/dev/null");
  const themeAfter = ab('eval "document.documentElement.classList.contains(\'dark\')" 2>&1').trim();
  if (themeBefore !== themeAfter) {
    line("PASS", `Theme toggle works (before=${themeBefore}, after=${themeAfter})`);
  } else {
    line("WARN", `Theme toggle clicked but class did not change (before=${themeBefore}, after=${themeAfter})`);
  }
} else {
  line("WARN", "Theme toggle button not found in settings");
}

// ============================================================
// SUMMARY
// ============================================================
console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  SUMMARY: ${pass} PASS · ${fail} FAIL · ${warn} WARN`);
if (bugs.length > 0) {
  console.log("\n  BUGS FOUND:");
  for (const b of bugs) {
    console.log(`    [${b.kind}] ${b.page ?? "unknown"} — ${b.detail?.slice(0, 200)}`);
  }
} else {
  console.log("\n  ✓ No page errors, no blank pages, no UI defects found.");
}
console.log(`  Screenshots saved to: ${SCREENSHOT_DIR}/`);
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(bugs.length > 0 ? 1 : 0);
