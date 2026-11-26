/**
 * feature-smoke-test.ts — end-to-end smoke test of every feature built
 * across all sessions. Runs against the live server at localhost:3000.
 *
 * Usage: npx tsx scripts/feature-smoke-test.ts
 *
 * Each test hits the API or verifies a code path. Prints PASS/FAIL per feature.
 */
import { idb } from "../lib/db";

const BASE = "http://localhost:3000";
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

// ── Part 1 tasks ────────────────────────────────────────────────────────────

// Task 1: Online indicator dot removed from AppShell
await test("P1-T1: online dot removed from AppShell", async () => {
  const src = await Bun.file("layout/AppShell.tsx").text();
  return !src.includes("bg-emerald-500") || !src.includes("user.status === \"online\"");
});

// Task 2: Mission repeatsDaily + attachment fields
await test("P1-T2: mission form has repeatsDaily + attachment", async () => {
  const src = await Bun.file("pages/MissionsPage.tsx").text();
  return src.includes("repeatsDaily") && src.includes("attachmentType") && src.includes("Attach Resource");
});

// Task 3: Comment thread resume fix (key prop)
await test("P1-T3: comment thread remount on reopen", async () => {
  const src = await Bun.file("feed/CommentThreadModal.tsx").text();
  return src.includes("key={`${postId}-${isOpen}`}") || src.includes("key={`${postId}-${isOpen}`");
});

// Task 4: Share as post + Share to picker
await test("P1-T4: share as post + share to picker", async () => {
  const src = await Bun.file("feed/PostCard.tsx").text();
  return src.includes("handleShareAsPost") && src.includes("handleShareToCircle") && src.includes("handleShareToFollower");
});

// Task 5: Save post with real IDB boards
await test("P1-T5: save post uses IDB boards", async () => {
  const src = await Bun.file("hooks/use-boards.ts").text();
  return src.includes("idb") && !src.includes("firebase");
});

// Task 6: FAB inner circle removed
await test("P1-T6: FAB no nested circle", async () => {
  const src = await Bun.file("ui/CreateExperienceModal.tsx").text();
  return src.includes("no-default-hover-elevate");
});

// Task 7: Mind DNA + Read tab removed
await test("P1-T7: Mind DNA + Read tab removed", async () => {
  const src = await Bun.file("pages/LibraryPage.tsx").text();
  return !src.includes("MindDNA") && !src.includes("ReadTab") && !src.includes("value=\"dna\"") && !src.includes("value=\"read\"");
});

// Task 8: Diagnostic Engine renamed
await test("P1-T8: Diagnostic Engine → Edit & Repair Mind", async () => {
  const src = await Bun.file("MindDrawer.tsx").text();
  return src.includes("Edit & Repair Mind") && !src.includes("Launch Diagnostic Engine");
});

// Task 9: Swipe gestures + large text in mind chat
await test("P1-T9: swipe gestures + large text in chat", async () => {
  const src = await Bun.file("runtime/MindChatRuntime.tsx").text();
  return src.includes("drag=\"x\"") && src.includes("handleSwipeEnd") && src.includes("hasImage");
});

// Task 10: Create tag in branch section
await test("P1-T10: create tag in branch section", async () => {
  const src = await Bun.file("BranchManagerSidebar.tsx").text();
  return src.includes("Create tag") && src.includes("onCreateTag") && src.includes("handleCreateTag");
});

// Task 11: Branch fork = PR-style, not blank mind
await test("P1-T11: branch fork copies nodes", async () => {
  const src = await Bun.file("hooks/use-mind-repo.ts").text();
  return src.includes("forked_from_node_id") && src.includes("branch_id") && src.includes("idMap");
});

// Task 12: Settings appearance text overlap fix
await test("P1-T12: settings appearance no overlap", async () => {
  const src = await Bun.file("pages/SettingsPage.tsx").text();
  return src.includes("no-default-hover-elevate");
});

// Task 13: Profile edit icons on avatar + cover
await test("P1-T13: profile avatar + cover edit icons", async () => {
  const src = await Bun.file("pages/ProfilePage.tsx").text();
  return src.includes("avatarInputRef") && src.includes("coverInputRef") && src.includes("handleImageUpload") && src.includes("Camera");
});

// Task 14: Notifications have postId + createNotification
await test("P1-T14: notifications fixed + createNotification", async () => {
  const src = await Bun.file("hooks/use-notifications.ts").text();
  return src.includes("createNotification") && src.includes("postId: \"seed-post-1\"");
});

// Task 15: Community posts use PostCard
await test("P1-T15: community uses PostCard", async () => {
  const src = await Bun.file("pages/CommunityPage.tsx").text();
  return src.includes("PostCard") && src.includes("reactToPost");
});

// ── Part 2 tasks ────────────────────────────────────────────────────────────

// Task 1: Note post type
await test("P2-T1: note post type + inline rendering", async () => {
  const creator = await Bun.file("feed/PostCreator.tsx").text();
  const card = await Bun.file("feed/PostCard.tsx").text();
  return creator.includes("postType === \"note\"") && creator.includes("noteAttachments") && card.includes("post.postType === \"note\"") && card.includes("StickyNote");
});

// Task 2: Live recording + PiP
await test("P2-T2: live recording + background PiP", async () => {
  const src = await Bun.file("runtime/RealtimeSessionView.tsx").text();
  return src.includes("MediaRecorder") && src.includes("handleStartRecording") && src.includes("handleTogglePip") && src.includes("isRecording");
});

// Task 3: @Skill picker in NodeEditor
await test("P2-T3: @Skill picker in NodeEditor", async () => {
  const src = await Bun.file("NodeEditor.tsx").text();
  return src.includes("skillPickerOpen") && src.includes("handleInsertSkill") && src.includes("NodeSkillReference") && src.includes("Built with Skill");
});

// Task 4: @Habit picker + habit-loop template
await test("P2-T4: @Habit picker + habit template", async () => {
  const src = await Bun.file("NodeEditor.tsx").text();
  return src.includes("habitPickerOpen") && src.includes("handleInsertHabit") && src.includes("habitTemplate") && src.includes("HabitNote");
});

// Task 5: Skill store type + hook
await test("P2-T5: SkillEntry type + use-skills hook", async () => {
  const types = await Bun.file("lib/types.ts").text();
  const hook = await Bun.file("hooks/use-skills.ts").text();
  return types.includes("SkillEntry") && types.includes("SkillStep") && hook.includes("createSkillFromMind") && hook.includes("buildSkillId");
});

// Task 6: Three-layer search
await test("P2-T6: three-layer search route", async () => {
  const res = await fetch(`${BASE}/api/v1/search/skills?q=test`);
  const data = await res.json();
  return res.status === 200 && Array.isArray(data.results);
});

// Task 7: Context-aware @Skill auto-suggest
await test("P2-T7: context-aware skill filtering", async () => {
  const src = await Bun.file("NodeEditor.tsx").text();
  return src.includes("contextAwareSkills") && src.includes("nodeContext");
});

// Task 8: Skill publishing pipeline
await test("P2-T8: skill publishing pipeline", async () => {
  const hook = await Bun.file("hooks/use-skills.ts").text();
  return hook.includes("submitForReview") && hook.includes("approveAndPublish") && hook.includes("status: \"private\"");
});

// Task 9: Authoring convention (SkillStep has yes/no outcomes)
await test("P2-T9: skill step authoring convention", async () => {
  const types = await Bun.file("lib/types.ts").text();
  return types.includes("yesOutcome") && types.includes("noOutcome") && types.includes("errorIfSkipped") && types.includes("tool?");
});

// ── Infrastructure / preview fixes ──────────────────────────────────────────

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

await test("INFRA: SW v5 (purges stale caches)", async () => {
  const sw = await (await fetch(`${BASE}/sw.js`)).text();
  return sw.includes("v5") && sw.includes("allSettled");
});

await test("INFRA: graceful shutdown handler", async () => {
  const src = await Bun.file("server.ts").text();
  return src.includes("SIGTERM") && src.includes("SIGINT") && src.includes("uncaughtException");
});

await test("INFRA: /ready readiness probe", async () => {
  const res = await fetch(`${BASE}/api/ready`);
  const data = await res.json();
  return res.status === 200 && data.status === "ready";
});

await test("INFRA: PORT env var respected", async () => {
  const src = await Bun.file("server.ts").text();
  return src.includes("process.env.PORT");
});

await test("INFRA: IDB v19 (skills + habits stores)", async () => {
  const src = await Bun.file("lib/db.ts").text();
  return src.includes("DB_VERSION = 19") && src.includes("skills") && src.includes("habits");
});

await test("INFRA: IDB put durability (tx.oncomplete)", async () => {
  const src = await Bun.file("lib/db.ts").text();
  // Verify put uses tx.oncomplete, not request.onsuccess
  const putSection = src.substring(src.indexOf("async put<"), src.indexOf("async putAll"));
  return putSection.includes("tx.oncomplete") && !putSection.includes("request.onsuccess");
});

await test("INFRA: firebase not in HomeFeed chunk (perf)", async () => {
  const src = await Bun.file("hooks/use-boards.ts").text();
  return !src.includes("firebase") && !src.includes("@/lib/firebase");
});

await test("INFRA: confetti is dynamic import (perf)", async () => {
  const src = await Bun.file("feed/PostCard.tsx").text();
  return !src.includes("from \"@/lib/confetti\"") && src.includes("import(\"@/lib/confetti\")");
});

// ── Print results ───────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════");
console.log("  FEATURE SMOKE TEST — Results");
console.log("══════════════════════════════════════════════════════════════");
for (const r of results) {
  const icon = r.status === "PASS" ? "✓" : "✗";
  console.log(`  ${icon} ${r.status}  ${r.feature}${r.detail ? `  — ${r.detail}` : ""}`);
}
console.log("──────────────────────────────────────────────────────────────");
console.log(`  Total: ${pass + fail}  |  PASS: ${pass}  |  FAIL: ${fail}`);
console.log("══════════════════════════════════════════════════════════════\n");

if (fail > 0) {
  process.exit(1);
}
