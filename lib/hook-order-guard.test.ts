/**
 * hook-order-guard.test.ts — regression guard for React error #310.
 *
 * React error #310 ("Rendered more hooks than during the previous render")
 * fires when a component's hook count changes between renders. The classic
 * cause is an early `return null` BEFORE a `useState`/`useEffect`/etc call:
 *
 *   function MindDrawer({ mind }) {
 *     if (!mind) return null;            // ← early return
 *     const [x, setX] = useState(0);      // ← hook AFTER early return = BUG
 *   }
 *
 * When `mind` flips from null → object, the component suddenly calls one
 * more hook than last render → React throws #310 → blank screen in prod.
 *
 * This test scans every .tsx file in the project (excluding node_modules,
 * dist, mockup-sandbox, and .test files) for that pattern and fails if any
 * component has a hook call AFTER an early-return statement at the same
 * brace nesting level. False positives are minimized by:
 *   - Only scanning top-level component functions (capitalized name)
 *   - Tracking brace depth so nested function early returns don't count
 *   - Only counting `return null`, `return;`, `return undefined` as early
 *     returns (not the final `return <JSX>` at the end of the function)
 *
 * This is a static heuristic — it can't catch every hook-order bug, but it
 * catches the pattern that bit us in production on the /library route
 * (MindDrawer.tsx, fixed in commit prior to this test).
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "mockup-sandbox",
  "api-server",
  "functions",
  ".git",
  "public",
  "scripts",
  "supabase",
  "data",
]);

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".tsx") &&
      !entry.name.includes(".test.")
    ) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Match `function ComponentName(` or `const ComponentName = (...) =>` or
// `const ComponentName = function`. We only care about names starting with
// an uppercase letter (React component convention).
const COMPONENT_DEF =
  /(?:^|\n)\s*(?:export\s+)?(?:function\s+([A-Z][A-Za-z0-9_]*)|const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_,\s]*)\s*=>)/g;

// Match hook calls: `useFoo(`, `useState(`, `useEffect(`, etc.
const HOOK_CALL = /\buse[A-Z][A-Za-z0-9_]*\s*\(/g;

// Match early-return statements: `return null`, `return;`, `return undefined`,
// `return null;`, etc. NOT the final `return (<JSX>)` or `return <JSX>`.
const EARLY_RETURN = /\breturn\s+(?:null|undefined|void\s+0)\s*[;,]/g;

interface Violation {
  file: string;
  component: string;
  earlyReturnLine: number;
  hookAfterReturnLine: number;
  hookSnippet: string;
}

function findHookOrderViolations(filePath: string): Violation[] {
  const src = fs.readFileSync(filePath, "utf8");
  if (!src.includes("use") || !src.includes("return")) return [];

  const violations: Violation[] = [];
  let m: RegExpExecArray | null;

  // Find every component declaration.
  COMPONENT_DEF.lastIndex = 0;
  while ((m = COMPONENT_DEF.exec(src)) !== null) {
    const componentName = m[1] || m[2];
    if (!componentName) continue;

    // Find the function body start. We can't just `indexOf("{")` because
    // the parameter list may contain braces (e.g. destructured `{ x }`).
    // Strategy: find the first `(` after the def, match parens to find its
    // closing `)`, then find the first `{` after that — that's the body.
    const defStart = m.index + m[0].length;
    let parenDepth = 0;
    let parenSeen = false;
    let bodyStart = -1;
    for (let j = defStart; j < src.length; j++) {
      const ch = src[j];
      if (ch === "(") { parenDepth++; parenSeen = true; }
      else if (ch === ")") { parenDepth--; }
      else if (ch === "{" && parenSeen && parenDepth === 0) {
        bodyStart = j;
        break;
      }
      // For arrow functions without parens (e.g. `const X = arg => {`),
      // parenSeen may never become true — fall back to first `{`.
      if (j - defStart > 500) break; // safety: don't scan forever
    }
    if (bodyStart === -1) bodyStart = src.indexOf("{", defStart);
    if (bodyStart === -1) continue; // arrow without braces — single expression

    // Match braces to find the end of the component body.
    let depth = 1;
    let i = bodyStart + 1;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    const bodyEnd = i; // exclusive

    // Scan the body line-by-line, tracking brace depth relative to body root.
    // An early return only counts at depth 1 (one level deep = top of body,
    // because the body root `{` itself brings us to depth 1).
    // A hook call only counts at depth 1 (top-level of the component body).
    const body = src.slice(bodyStart, bodyEnd);
    const lines = body.split("\n");
    let relDepth = 0;
    let earlyReturnLine: number | null = null;
    const bodyStartLine = src.slice(0, bodyStart).split("\n").length;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];

      // depthBeforeLine = depth BEFORE this line's braces were counted.
      const opens = (line.match(/{/g)?.length) ?? 0;
      const closes = (line.match(/}/g)?.length) ?? 0;
      const depthBeforeLine = relDepth;

      // Update depth by counting braces on this line (rough — ignores braces
      // in strings/regexps, but for component bodies this is good enough).
      relDepth += opens - closes;

      // Only inspect lines at the top level of the component body (depth 1:
      // one level deep because of the body root `{`).
      if (depthBeforeLine === 1) {
        // Check for early return.
        EARLY_RETURN.lastIndex = 0;
        if (EARLY_RETURN.test(line)) {
          earlyReturnLine = bodyStartLine + lineIdx;
        }

        // Check for hook call AFTER an early return.
        if (earlyReturnLine !== null) {
          HOOK_CALL.lastIndex = 0;
          const hookMatch = HOOK_CALL.exec(line);
          if (hookMatch) {
            violations.push({
              file: path.relative(ROOT, filePath),
              component: componentName,
              earlyReturnLine,
              hookAfterReturnLine: bodyStartLine + lineIdx,
              hookSnippet: line.trim().slice(0, 80),
            });
          }
        }
      }
    }
  }

  return violations;
}

describe("React hook-order regression guard (#310)", () => {
  it("no component has a hook call after an early return", () => {
    const files = walk(ROOT);
    expect(files.length).toBeGreaterThan(0);

    const allViolations: Violation[] = [];
    for (const f of files) {
      allViolations.push(...findHookOrderViolations(f));
    }

    if (allViolations.length > 0) {
      const report = allViolations
        .map(
          (v) =>
            `  - ${v.file} → <${v.component}>: early return at L${v.earlyReturnLine}, hook at L${v.hookAfterReturnLine} → "${v.hookSnippet}"`,
        )
        .join("\n");
      // Fail with a detailed message so the engineer can find the bug instantly.
      expect.fail(
        `React error #310 risk detected — ${allViolations.length} component(s) have a hook call AFTER an early return.\n` +
          `When the early-return condition flips between renders, React sees a different hook count → #310 crash.\n` +
          `Move all hooks ABOVE the early return, or use a default value (e.g. mind?.id ?? "") instead of returning null.\n\n` +
          `Violations:\n${report}`,
      );
    }
  });
});
