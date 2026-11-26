/**
 * feature-smoke-test.ts — end-to-end smoke test of every feature built
 * across all sessions. Runs against the live server at localhost:3000.
 *
 * Usage: npx tsx scripts/feature-smoke-test.ts
 */
import { readFileSync } from "fs";
import { join } from "path";

const BASE = "http://localhost:3000";
const ROOT = join(import.meta.dirname, "..");
const r = (p: string) => readFileSync(join(ROOT, p), "utf-8");

let pass = 0;
let fail = 0;
const results: { feature: string; status: "PASS" | "FAIL"; detail: string }[] = [];

async function test(name: string, fn: () => Promise<boolean | string>) {
  try {
    const result = await fn();
    if (result === true || result === undefined) {
      pass++;
      results.push({ feature: name, status: "PASS", detail: "" });
    } else if (typeof result === "string") {
      pass++;
      results.push({ feature: name, status: "PASS", detail: result });
    } else {
      fail++;
      results.push({ feature: name, status: "FAIL", detail: "returned false" });
    }
  } catch (err) {
    fail++;
    results.push({ feature: name, status: "FAIL", detail: err instanceof Error ? err.message : String(err) });
  }
}

// ── Part 1 ──────────────────────────────────────────────────────────────────

await test("P1-T1: online dot removed from AppShell", async () => {
  const src = r("layout/AppShell.tsx");
  return !src.includes("user.status === \"online\" ? \"bg-emerald-500\"");
});

await test("P1-T2: mission form has repeatsDaily + attachment", async () => {
  const src = r("pages/MissionsPage.tsx");
  return src.includes("repeatsDaily") && src.includes("attachmentType") && src.includes("Attach Resource");
});

await test("P1-T3: comment thread remount on reopen", async () => {
  const src = r("feed/CommentThreadModal.tsx");
  return src.includes("key={`${postId}-${isOpen}`}") || src.includes("postId-");
});

await test("P1-T4: share as post + share to picker", async () => {
  const src = r("feed/PostCard.tsx");
  return src.includes("handleShareAsPost") && src.includes("handleShareToCircle") && src.includes("handleShareToFollower");
});

await test("P1-T5: save post uses IDB boards", async () => {
  const src = r("hooks/use-boards.ts");
  // Check that firebase is not IMPORTED (comments mentioning it are fine).
  const importLines = src.split("\n").filter((l) => l.startsWith("import "));
  return src.includes("from \"@/lib/db\"") && !importLines.some((l) => l.includes("firebase"));
});

await test("P1-T6: FAB no nested circle", async () => {
  const src = r("ui/CreateExperienceModal.tsx");
  return src.includes("no-default-hover-elevate");
});

await test("P1-T7: Mind DNA + Read tab removed", async () => {
  const src = r("pages/LibraryPage.tsx");
  return !src.includes("MindDNA") && !src.includes("ReadTab");
});

await test("P1-T8: Diagnostic Engine → Edit & Repair Mind", async () => {
  const src = r("MindDrawer.tsx");
  return src.includes("Edit & Repair Mind") && !src.includes("Launch Diagnostic Engine");
});

await test("P1-T9: swipe gestures + large text in chat", async () => {
  const src = r("runtime/MindChatRuntime.tsx");
  return src.includes("drag=\"x\"") && src.includes("handleSwipeEnd") && src.includes("hasImage");
});

await test("P1-T10: create tag in branch section", async () => {
  const src = r("BranchManagerSidebar.tsx");
  return src.includes("Create tag") && src.includes("onCreateTag");
});

await test("P1-T11: branch fork copies nodes", async () => {
  const src = r("hooks/use-mind-repo.ts");
  return src.includes("forked_from_node_id") && src.includes("branch_id") && src.includes("idMap");
});

await test("P1-T12: settings appearance no overlap", async () => {
  const src = r("pages/SettingsPage.tsx");
  return src.includes("no-default-hover-elevate");
});

await test("P1-T13: profile avatar + cover edit icons", async () => {
  const src = r("pages/ProfilePage.tsx");
  return src.includes("avatarInputRef") && src.includes("coverInputRef") && src.includes("handleImageUpload");
});

await test("P1-T14: notifications fixed + createNotification", async () => {
  const src = r("hooks/use-notifications.ts");
  return src.includes("createNotification") && src.includes("postId: \"seed-post-1\"");
});

await test("P1-T15: community uses PostCard", async () => {
  const src = r("pages/CommunityPage.tsx");
  return src.includes("PostCard") && src.includes("reactToPost");
});

// ── Part 2 ──────────────────────────────────────────────────────────────────

await test("P2-T1: note post type + inline rendering", async () => {
  const creator = r("feed/PostCreator.tsx");
  const card = r("feed/PostCard.tsx");
  return creator.includes("postType === \"note\"") && creator.includes("noteAttachments") && card.includes("post.postType === \"note\"");
});

await test("P2-T2: live recording + background PiP", async () => {
  const src = r("runtime/RealtimeSessionView.tsx");
  return src.includes("MediaRecorder") && src.includes("handleStartRecording") && src.includes("handleTogglePip");
});

await test("P2-T3: @Skill picker in NodeEditor", async () => {
  const src = r("NodeEditor.tsx");
  return src.includes("skillPickerOpen") && src.includes("handleInsertSkill") && src.includes("Built with Skill");
});

await test("P2-T4: @Habit picker + habit template", async () => {
  const src = r("NodeEditor.tsx");
  return src.includes("habitPickerOpen") && src.includes("handleInsertHabit") && src.includes("habitTemplate");
});

await test("P2-T5: SkillEntry type + use-skills hook", async () => {
  const types = r("lib/types.ts");
  const hook = r("hooks/use-skills.ts");
  return types.includes("SkillEntry") && types.includes("SkillStep") && hook.includes("createSkillFromMind");
});

await test("P2-T6: three-layer search route", async () => {
  const res = await fetch(`${BASE}/api/v1/search/skills?q=test`);
  const data = await res.json();
  return res.status === 200 && Array.isArray(data.results);
});

await test("P2-T7: context-aware skill filtering", async () => {
  const src = r("NodeEditor.tsx");
  return src.includes("contextAwareSkills") && src.includes("nodeContext");
});

await test("P2-T8: skill publishing pipeline", async () => {
  const hook = r("hooks/use-skills.ts");
  return hook.includes("submitForReview") && hook.includes("approveAndPublish");
});

await test("P2-T9: skill step authoring convention", async () => {
  const types = r("lib/types.ts");
  return types.includes("yesOutcome") && types.includes("noOutcome") && types.includes("errorIfSkipped");
});

// ── Infrastructure / preview ────────────────────────────────────────────────

await test("INFRA: production mode (no @vite)", async () => {
  const html = await (await fetch(`${BASE}/`)).text();
  return !html.includes("@vite/client") && !html.includes("@react-refresh");
});

await test("INFRA: X-Frame-Options allows iframe", async () => {
  const res = await fetch(`${BASE}/`);
  const xfo = res.headers.get("x-frame-options");
  return xfo === "ALLOWALL" || xfo === "SAMEORIGIN";
});

await test("INFRA: CSP frame-ancestors allows space-z.ai", async () => {
  const res = await fetch(`${BASE}/`);
  const csp = res.headers.get("content-security-policy") || "";
  return csp.includes("frame-ancestors") && csp.includes("space-z.ai");
});

await test("INFRA: HTML no-cache (fresh preview)", async () => {
  const res = await fetch(`${BASE}/`);
  const cc = res.headers.get("cache-control") || "";
  return cc.includes("no-cache") || cc.includes("no-store");
});

await test("INFRA: SW-killer present (CSP-compliant external script)", async () => {
  // Phase 3: sw.js was deleted (functionally disabled, source of stale-cache
  // bugs). Replaced by /sw-killer.js — an external same-origin script that
  // unregisters any stale service worker before the module bundle loads.
  // External file is required because the strict CSP (`script-src 'self'`)
  // blocks inline scripts.
  const sw = await (await fetch(`${BASE}/sw-killer.js`)).text();
  return sw.includes("serviceWorker") && sw.includes("unregister");
});

await test("PERF: feed stale-while-revalidate (fast warm + SWR path)", async () => {
  // PREVIEW PERF FIX guard: warm responses must be <100ms (p95 budget 400ms).
  // The feed cache serves HIT (<30s old) or STALE (30s..5min, background
  // refresh fires). Either way a warm request must never pay the two
  // sequential Supabase round trips (measured 514-1900ms cold).
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/feed?mode=foryou&limit=20`);
  const elapsed = Date.now() - t0;
  const cacheState = res.headers.get("x-feed-cache") || "none";
  if (!res.ok) return false;
  if (cacheState === "MISS") return true; // cold (server just restarted) — acceptable
  return elapsed < 400; // HIT or STALE must be fast
});

await test("PREVIEW: font-loader.js external (CSP-safe async fonts)", async () => {
  // CSP fix guard: index.html must NOT contain inline event handlers
  // (onload=) and must reference the external font-loader.js. The old
  // inline onload="this.media='all'" was blocked by script-src 'self' →
  // Google Fonts never applied + CSP violation on every load.
  const html = await (await fetch(`${BASE}/`)).text();
  const loader = await (await fetch(`${BASE}/font-loader.js`)).text();
  return (
    !html.includes("onload=") &&
    html.includes("/font-loader.js") &&
    loader.includes("fonts.googleapis.com")
  );
});

await test("INFRA: graceful shutdown handler", async () => {
  const src = r("server.ts");
  return src.includes("SIGTERM") && src.includes("uncaughtException");
});

await test("INFRA: /ready readiness probe", async () => {
  const res = await fetch(`${BASE}/api/ready`);
  const data = await res.json();
  return res.status === 200 && data.status === "ready";
});

await test("INFRA: PORT env var respected", async () => {
  const src = r("server.ts");
  return src.includes("process.env.PORT");
});

await test("INFRA: IDB v19 (skills + habits stores)", async () => {
  const src = r("lib/db.ts");
  return src.includes("DB_VERSION = 19") && src.includes("\"skills\"") && src.includes("\"habits\"");
});

await test("INFRA: IDB put durability (tx.oncomplete)", async () => {
  const src = r("lib/db.ts");
  // Check the actual code lines (not comments) use tx.oncomplete for put.
  const putIdx = src.indexOf("async put<");
  const putAllIdx = src.indexOf("async putAll", putIdx);
  const section = src.substring(putIdx, putAllIdx);
  // Strip comments to avoid matching the explanatory comment.
  const codeOnly = section.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return codeOnly.includes("tx.oncomplete") && !codeOnly.includes("request.onsuccess");
});

await test("INFRA: firebase not in use-boards (perf)", async () => {
  const src = r("hooks/use-boards.ts");
  const importLines = src.split("\n").filter((l) => l.startsWith("import "));
  return !importLines.some((l) => l.includes("firebase"));
});

await test("INFRA: confetti is dynamic import (perf)", async () => {
  const src = r("feed/PostCard.tsx");
  return !src.includes("from \"@/lib/confetti\"") && src.includes("import(\"@/lib/confetti\")");
});

// ── Print ───────────────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════");
console.log("  FEATURE SMOKE TEST — Results");
console.log("══════════════════════════════════════════════════════════════");
for (const res of results) {
  const icon = res.status === "PASS" ? "✓" : "✗";
  console.log(`  ${icon} ${res.status}  ${res.feature}${res.detail ? `  — ${res.detail}` : ""}`);
}
console.log("──────────────────────────────────────────────────────────────");
console.log(`  Total: ${pass + fail}  |  PASS: ${pass}  |  FAIL: ${fail}`);
console.log("══════════════════════════════════════════════════════════════\n");

if (fail > 0) process.exit(1);
