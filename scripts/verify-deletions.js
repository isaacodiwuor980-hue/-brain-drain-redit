#!/usr/bin/env node
/** Verify deletion candidates have zero live references. Read-only. */
const fs = require("fs");
const path = require("path");

const ROOT = "/home/z/my-project/MindSpool-latest-";
const skip = ["node_modules", ".git", "dist", "mockup-sandbox", ".vite"];
const srcExts = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".html", ".sh", ".rules"];

let files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (skip.includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (srcExts.includes(path.extname(e.name))) files.push(p);
  }
})(ROOT);

// candidate path (relative to root, no ext) -> tokens that would indicate a reference
const cands = {
  "components/ (duplicate OnboardingFlow)": ["components/onboarding/OnboardingFlow"],
  "screenshots.html": ["screenshots.html"],
  "ui/accordion": ["ui/accordion", "@/components/ui/accordion"],
  "ui/alert": ["ui/alert/", "@/components/ui/alert"],
  "ui/aspect-ratio": ["ui/aspect-ratio", "react-aspect-ratio"],
  "ui/breadcrumb": ["ui/breadcrumb"],
  "ui/button-group": ["ui/button-group"],
  "ui/calendar": ["ui/calendar", "react-day-picker"],
  "ui/carousel": ["ui/carousel", "embla-carousel-react"],
  "ui/collapsible": ["ui/collapsible", "react-collapsible"],
  "ui/command": ["ui/command", "cmdk"],
  "ui/context-menu": ["ui/context-menu", "react-context-menu"],
  "ui/drawer": ["ui/drawer", "vaul"],
  "ui/empty": ["ui/empty"],
  "ui/field": ["ui/field"],
  "ui/form": ["ui/form", "react-hook-form"],
  "ui/hover-card": ["ui/hover-card", "react-hover-card"],
  "ui/input-group": ["ui/input-group"],
  "ui/input-otp": ["ui/input-otp", "input-otp"],
  "ui/item": ["ui/item"],
  "ui/kbd": ["ui/kbd"],
  "ui/menubar": ["ui/menubar", "react-menubar"],
  "ui/navigation-menu": ["ui/navigation-menu", "react-navigation-menu"],
  "ui/pagination": ["ui/pagination"],
  "ui/popover": ["ui/popover", "react-popover"],
  "ui/radio-group": ["ui/radio-group", "react-radio-group"],
  "ui/resizable": ["ui/resizable", "react-resizable-panels"],
  "ui/sidebar": ["ui/sidebar"],
  "ui/slider": ["ui/slider", "react-slider"],
  "ui/sonner": ["ui/sonner", "sonner"],
  "ui/spinner": ["ui/spinner"],
  "ui/table": ["ui/table"],
  "ui/toggle": ["ui/toggle"],
  "ui/toggle-group": ["ui/toggle-group"],
  "hooks/use-api-health": ["use-api-health"],
  "hooks/use-device-features": ["use-device-features"],
  "hooks/use-gamification": ["use-gamification"],
  "hooks/use-mobile": ["use-mobile"],
  "lib/firebase.ts": ["lib/firebase"],
  "lib/smart-image": ["smart-image"],
  "lib/puzzle-share": ["puzzle-share"],
  "library/MindDNA": ["MindDNA"],
  "library/ReadTab": ["ReadTab"],
  "api-server/src/index.ts": ["api-server/src/index"],
  "public/_redirects": ["_redirects"],
  "public/placeholder-logo.png": ["placeholder-logo.png"],
  "public/placeholder-logo.svg": ["placeholder-logo.svg"],
  "public/placeholder-user.jpg": ["placeholder-user.jpg"],
  "public/placeholder.jpg": ["placeholder.jpg"],
  "public/placeholder.svg": ["placeholder.svg"],
  "public/icon-dark-32x32.png": ["icon-dark-32x32"],
  "public/icon-light-32x32.png": ["icon-light-32x32"],
  "scripts/capture-screenshots.mjs": ["capture-screenshots"],
};

// files whose CONTENT counts as a reference (config/code), excluding docs & lockfiles
const isDocOrLock = (f) =>
  f.endsWith(".md") || f.includes(".gitignore") || f.includes("package.json") ||
  f.includes("package-lock") || f.includes(".env") || f.includes(".dockerignore");

const contents = files.map((f) => [f, fs.readFileSync(f, "utf8")]);

let referentCount = 0;
for (const [name, tokens] of Object.entries(cands)) {
  const hits = [];
  for (const [f, c] of contents) {
    if (isDocOrLock(f)) continue;
    for (const t of tokens) {
      if (c.includes(t) && !(f === path.join(ROOT, name) || f.startsWith(path.join(ROOT, name)))) {
        hits.push(`${f.replace(ROOT, "")} [${t}]`);
        break;
      }
    }
  }
  if (hits.length) { referentCount++; console.log(`REFERENCED  ${name}`); hits.slice(0, 5).forEach((h) => console.log(`            <- ${h}`)); }
  else console.log(`CLEAN       ${name}`);
}
console.log(`\n${Object.keys(cands).length - referentCount}/${Object.keys(cands).length} candidates have zero live references.`);
