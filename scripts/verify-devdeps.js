#!/usr/bin/env node
/** Check whether candidate devDeps are imported OUTSIDE the dead ui/ files. Read-only. */
const fs = require("fs");
const path = require("path");

const ROOT = "/home/z/my-project/BRAIN-DRAIN-latest-";
const skip = ["node_modules", ".git", "dist", "mockup-sandbox", ".vite"];

let files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (skip.includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(e.name)) files.push(p);
  }
})(ROOT);

// dead ui/ files being deleted (imports inside these don't count)
const deadUi = [
  "accordion","alert","aspect-ratio","breadcrumb","button-group","calendar","carousel",
  "collapsible","command","context-menu","drawer","empty","field","form","hover-card",
  "input-group","input-otp","item","kbd","menubar","navigation-menu","pagination",
  "popover","radio-group","resizable","sidebar","slider","sonner","spinner","table",
  "toggle","toggle-group",
];
const isDeadUiFile = (f) => deadUi.some((n) => f === path.join(ROOT, "ui", n + ".tsx"));

const packages = [
  "next-themes","react-hook-form","embla-carousel-react","react-day-picker",
  "input-otp","sonner","vaul","react-resizable-panels","cmdk",
  "@radix-ui/react-accordion","@radix-ui/react-aspect-ratio","@radix-ui/react-collapsible",
  "@radix-ui/react-context-menu","@radix-ui/react-hover-card","@radix-ui/react-menubar",
  "@radix-ui/react-navigation-menu","@radix-ui/react-popover","@radix-ui/react-radio-group",
  "@radix-ui/react-slider","@radix-ui/react-toggle","@radix-ui/react-toggle-group",
];

for (const pkg of packages) {
  const hits = [];
  for (const f of files) {
    if (isDeadUiFile(f)) continue;
    const c = fs.readFileSync(f, "utf8");
    const re = new RegExp(`from ["']${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']|import\\(["']${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    if (re.test(c)) hits.push(f.replace(ROOT, ""));
  }
  console.log((hits.length ? "STILL-USED " : "ORPHAN     ") + pkg + (hits.length ? "  <- " + hits.join(", ") : ""));
}
