#!/usr/bin/env node
/**
 * deep-click-test.mjs — Deep frontend click testing.
 *
 * For each major page: snapshot all interactive elements, click each one,
 * capture any page errors / console errors / unexpected navigation (redirect
 * to home when it shouldn't). Reports a defect list.
 */

import { execSync } from "node:child_process";

const BASE = "http://localhost:3000";
let pass = 0, fail = 0, warn = 0;
const defects = [];

function line(level, msg) {
  const tag = level === "PASS" ? "✓" : level === "FAIL" ? "✗" : level === "WARN" ? "!" : "→";
  console.log(`  ${tag} ${level.padEnd(4)} ${msg}`);
  if (level === "PASS") pass++;
  else if (level === "FAIL") fail++;
  else if (level === "WARN") warn++;
}

function ab(args) {
  try {
    return execSync(`agent-browser ${args}`, { encoding: "utf8", timeout: 30000 });
  } catch (e) {
    return (e.stdout ?? "") + (e.stderr ?? "");
  }
}

function getErrors() {
  return ab("errors 2>&1").split("\n").filter(l => l.trim() && !l.includes("[agent-browser]"));
}

function clearLogs() {
  ab("console --clear 2>&1 >/dev/null");
  ab("errors --clear 2>&1 >/dev/null");
}

function getUrl() {
  return ab("get url 2>&1").trim();
}

function getRefs() {
  const snap = ab("snapshot -i 2>&1");
  const refs = [];
  const re = /- (?:button|link|tab) "([^"]*)"(?:[^\[]*)\[ref=(e\d+)\]/g;
  let m;
  while ((m = re.exec(snap)) !== null) {
    refs.push({ label: m[1], ref: m[2] });
  }
  return refs;
}

// Pages to test: [name, url, shouldStayOnPage]
const pages = [
  { name: "Home", url: "/", stay: true },
  { name: "Search", url: "/search", stay: true },
  { name: "Library (Brains)", url: "/library", stay: true },
  { name: "Missions (Pathways)", url: "/missions", stay: true },
  { name: "Topics", url: "/topics", stay: true },
  { name: "Community", url: "/community", stay: true },
  { name: "Messages", url: "/messages", stay: true },
  { name: "Notifications", url: "/notifications", stay: true },
  { name: "Profile", url: "/profile", stay: true },
  { name: "Settings", url: "/settings", stay: true },
];

// Buttons that are known-safe to skip (destructive or navigational chaos)
const SKIP_LABELS = [
  /sign out/i, /log ?out/i, /delete/i, /remove/i, /reset/i,
  /collapse/i, /expand/i,  // sidebar toggles cause layout changes mid-test
];

for (const page of pages) {
  console.log(`\n═══ ${page.name} (${page.url}) ═══`);
  ab(`open ${BASE}${page.url} 2>&1 >/dev/null`);
  ab("wait --load networkidle 2>&1 >/dev/null");
  ab("wait 2000 2>&1 >/dev/null");
  clearLogs();

  // Wait for any delayed errors
  ab("wait 1500 2>&1 >/dev/null");

  // 1. Check for page errors on load
  const loadErrors = getErrors();
  if (loadErrors.length > 0) {
    defects.push({ page: page.name, kind: "LOAD_ERROR", detail: loadErrors.join(";").slice(0, 300) });
    line("FAIL", `${page.name} — ${loadErrors.length} error(s) on load: ${loadErrors[0].slice(0, 120)}`);
  } else {
    line("PASS", `${page.name} — loads clean`);
  }

  // 2. Get all interactive elements
  const refs = getRefs();
  if (refs.length < 3) {
    defects.push({ page: page.name, kind: "BLANK_PAGE", detail: `only ${refs.length} interactive elements` });
    line("FAIL", `${page.name} — BLANK (only ${refs.length} elements)`);
    continue;
  }
  line("INFO", `${page.name} — ${refs.length} interactive elements`);

  // 3. Click each element (up to 25 per page to keep test time reasonable)
  const toTest = refs.filter(r => !SKIP_LABELS.some(s => s.test(r.label))).slice(0, 25);
  let clicked = 0, errorsFound = 0, redirects = 0;

  for (const el of toTest) {
    const urlBefore = getUrl();
    clearLogs();
    ab(`click @${el.ref} 2>&1 >/dev/null`);
    ab("wait 800 2>&1 >/dev/null");

    // Check for errors after click
    const errs = getErrors();
    if (errs.length > 0) {
      errorsFound++;
      defects.push({ page: page.name, kind: "CLICK_ERROR", detail: `clicking "${el.label}": ${errs.join(";").slice(0, 200)}` });
      line("FAIL", `  click "${el.label}" → ${errs[0].slice(0, 120)}`);
    }

    // Check for unexpected redirect to home (away from the page under test)
    const urlAfter = getUrl();
    if (page.stay && urlAfter === `${BASE}/` && page.url !== "/") {
      redirects++;
      defects.push({ page: page.name, kind: "UNEXPECTED_REDIRECT", detail: `clicking "${el.label}" redirected to home` });
      line("WARN", `  click "${el.label}" → redirected to home`);
    }

    clicked++;

    // If the click opened a modal/dialog, close it (Escape) before continuing
    const snapNow = ab("snapshot -i 2>&1");
    if (snapNow.includes("dialog") || snapNow.includes("Close")) {
      ab("press Escape 2>&1 >/dev/null");
      ab("wait 500 2>&1 >/dev/null");
    }

    // If we navigated away (to a different page), go back
    if (getUrl() !== urlBefore && !urlAfter.includes(page.url)) {
      ab(`open ${BASE}${page.url} 2>&1 >/dev/null`);
      ab("wait --load networkidle 2>&1 >/dev/null");
      ab("wait 1000 2>&1 >/dev/null");
    }
  }

  if (errorsFound === 0 && redirects === 0) {
    line("PASS", `${page.name} — ${clicked} clicks, 0 errors, 0 unexpected redirects`);
  } else {
    line("WARN", `${page.name} — ${clicked} clicks, ${errorsFound} errors, ${redirects} redirects`);
  }
}

// ── SUMMARY ──
console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  DEEP CLICK TEST: ${pass} PASS · ${fail} FAIL · ${warn} WARN`);
if (defects.length > 0) {
  console.log(`\n  DEFECTS (${defects.length}):`);
  for (const d of defects) {
    console.log(`    [${d.kind}] ${d.page}: ${d.detail?.slice(0, 150)}`);
  }
} else {
  console.log("\n  ✓ All pages load clean, all clicks error-free, no unexpected redirects.");
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(defects.length > 0 ? 1 : 0);
