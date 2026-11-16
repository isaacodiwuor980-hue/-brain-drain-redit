#!/usr/bin/env node
/**
 * backend-stress.mjs — Brain Drain backend simulation + stress test.
 *
 * Hits every API route with: happy-path, edge-case (empty / huge / weird-types),
 * no-auth, bad-auth, malformed-JSON, and concurrent-burst inputs. Reports any
 * non-2xx/4xx response (5xx = real bug) and any response that crashes the connection.
 */

import { performance } from "node:perf_hooks";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const TOKEN_FAKE = "Bearer fake-token-for-401-test";
const TOKEN_GUEST = "Bearer guest-" + Math.random().toString(36).slice(2, 10);

const results = [];
const bugs = [];
let pass = 0, fail = 0, warn = 0;

function line(level, msg) {
  const tag = level === "PASS" ? "✓" : level === "FAIL" ? "✗" : level === "WARN" ? "!" : "→";
  console.log(`  ${tag} ${level.padEnd(4)} ${msg}`);
  if (level === "PASS") pass++;
  else if (level === "FAIL") fail++;
  else if (level === "WARN") warn++;
  results.push({ level, msg });
}

async function hit(method, path, opts = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: opts.token } : {}),
        ...opts.headers,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const dt = (performance.now() - t0).toFixed(1);
    let bodyText = "";
    try { bodyText = await res.text(); } catch {}
    let parsed = null;
    try { parsed = JSON.parse(bodyText); } catch {}
    return { ok: res.ok, status: res.status, dt, body: parsed ?? bodyText, raw: bodyText };
  } catch (e) {
    return { ok: false, status: 0, dt: (performance.now() - t0).toFixed(1), err: e.message, body: null };
  }
}

function expectStatus(label, res, want, level = "PASS") {
  if (res.status === want) {
    line("PASS", `${label} — ${res.status} in ${res.dt}ms`);
    return true;
  }
  if (res.status === 0) {
    bugs.push({ label, kind: "CRASH", detail: res.err });
    line("FAIL", `${label} — CRASH: ${res.err}`);
    return false;
  }
  if (res.status >= 500) {
    bugs.push({ label, kind: "5XX", status: res.status, body: res.raw?.slice(0, 300) });
    line("FAIL", `${label} — got ${res.status} (want ${want}): ${res.raw?.slice(0, 200)}`);
    return false;
  }
  line(level, `${label} — got ${res.status} (want ${want})`);
  return false;
}

// ============================================================
// PHASE A — Health & infra
// ============================================================
console.log("\n=== A. Health & Infra ===");
{
  let r = await hit("GET", "/api/healthz");
  expectStatus("GET /api/healthz", r, 200);
  if (r.body?.status !== "ok") line("WARN", `/api/healthz status=${r.body?.status} (expected ok)`);

  r = await hit("GET", "/api/ready");
  expectStatus("GET /api/ready", r, 200);
  if (r.body?.supabase !== "configured") line("WARN", `/api/ready supabase=${r.body?.supabase}`);

  r = await hit("GET", "/api/v1/health/detailed");
  if (r.status === 200 || r.status === 501) line("PASS", `GET /api/v1/health/detailed — ${r.status}`);
  else expectStatus("GET /api/v1/health/detailed", r, 200);

  r = await hit("GET", "/");
  expectStatus("GET / (HTML)", r, 200);
  if (r.raw && !r.raw.includes("<div id=\"root\"")) line("WARN", "/ does not render root div");

  r = await hit("GET", "/sw.js");
  expectStatus("GET /sw.js", r, 200);

  r = await hit("GET", "/manifest.webmanifest");
  expectStatus("GET /manifest.webmanifest", r, 200);

  r = await hit("GET", "/privacy-policy");
  expectStatus("GET /privacy-policy", r, 200);

  r = await hit("GET", "/terms-of-service");
  expectStatus("GET /terms-of-service", r, 200);

  // Unknown route → should 404, NOT 500
  r = await hit("GET", "/api/v1/this-does-not-exist");
  expectStatus("GET /api/v1/this-does-not-exist (should 404)", r, 404);
}

// ============================================================
// PHASE B — Public reads (no auth)
// ============================================================
console.log("\n=== B. Public reads (no auth) ===");
{
  let r = await hit("GET", "/api/feed");
  expectStatus("GET /api/feed", r, 200);
  if (r.body && !("posts" in r.body)) line("WARN", `/api/feed body missing 'posts' field`);

  r = await hit("GET", "/api/feed?topic=tech&cursor=abc&limit=20");
  expectStatus("GET /api/feed?topic=tech", r, 200);

  r = await hit("GET", "/api/topics");
  expectStatus("GET /api/topics", r, 200);
  if (Array.isArray(r.body) && r.body.length === 0) line("WARN", `/api/topics returned empty array`);

  r = await hit("GET", "/api/brains");
  expectStatus("GET /api/brains (no auth)", r, 200);

  r = await hit("GET", "/api/brains/nonexistent-id-12345");
  if (r.status === 200 || r.status === 404) line("PASS", `GET /api/brains/:id (nonexistent) — ${r.status}`);
  else expectStatus("GET /api/brains/:id (nonexistent)", r, 200);

  r = await hit("GET", "/api/v1/skills");
  expectStatus("GET /api/v1/skills", r, 200);

  r = await hit("GET", "/api/v1/skills/nonexistent-id");
  if (r.status === 200 || r.status === 404) line("PASS", `GET /api/v1/skills/:id (nonexistent) — ${r.status}`);
  else expectStatus("GET /api/v1/skills/:id (nonexistent)", r, 200);

  r = await hit("GET", "/api/v1/habits");
  expectStatus("GET /api/v1/habits", r, 200);

  r = await hit("GET", "/api/v1/habits/search?q=test");
  expectStatus("GET /api/v1/habits/search?q=test", r, 200);

  r = await hit("GET", "/api/v1/habits/nonexistent-id");
  if (r.status === 200 || r.status === 404) line("PASS", `GET /api/v1/habits/:id (nonexistent) — ${r.status}`);
  else expectStatus("GET /api/v1/habits/:id (nonexistent)", r, 200);

  r = await hit("GET", "/api/v1/search/skills?q=test");
  expectStatus("GET /api/v1/search/skills?q=test", r, 200);

  r = await hit("GET", "/api/v1/search?q=test");
  expectStatus("GET /api/v1/search?q=test", r, 200);

  r = await hit("GET", "/api/v1/datasets");
  expectStatus("GET /api/v1/datasets", r, 200);

  r = await hit("GET", "/api/intelligence/summary");
  expectStatus("GET /api/intelligence/summary", r, 200);

  r = await hit("GET", "/api/recommendations/brains");
  expectStatus("GET /api/recommendations/brains", r, 200);

  r = await hit("GET", "/api/v1/verify/test-user-id");
  if (r.status === 200 || r.status === 404 || r.status === 501) line("PASS", `GET /api/v1/verify/:userId — ${r.status}`);
  else expectStatus("GET /api/v1/verify/:userId", r, 200);

  r = await hit("GET", "/api/v1/provenance/test-record-id");
  if (r.status === 200 || r.status === 404 || r.status === 501) line("PASS", `GET /api/v1/provenance/:recordId — ${r.status}`);
  else expectStatus("GET /api/v1/provenance/:recordId", r, 200);

  r = await hit("GET", "/api/events/summary");
  expectStatus("GET /api/events/summary", r, 200);
}

// ============================================================
// PHASE C — Auth-protected writes WITHOUT auth (should 401, not 500)
// ============================================================
console.log("\n=== C. Auth-protected writes WITHOUT auth (should 401) ===");
{
  let r = await hit("POST", "/api/posts", { body: { content: "test" } });
  if (r.status === 401 || r.status === 403) line("PASS", `POST /api/posts (no auth) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/posts no-auth", kind: "5XX", status: r.status }); line("FAIL", `POST /api/posts (no auth) — ${r.status}`); }
  else line("WARN", `POST /api/posts (no auth) — got ${r.status}`);

  r = await hit("POST", "/api/topics", { body: { name: "test-topic" } });
  if (r.status === 401 || r.status === 403) line("PASS", `POST /api/topics (no auth) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/topics no-auth", kind: "5XX", status: r.status }); line("FAIL", `POST /api/topics (no auth) — ${r.status}`); }
  else line("WARN", `POST /api/topics (no auth) — got ${r.status}`);

  r = await hit("POST", "/api/topics/follow", { body: { topicId: "x" } });
  if (r.status === 401 || r.status === 403) line("PASS", `POST /api/topics/follow (no auth) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/topics/follow no-auth", kind: "5XX", status: r.status }); line("FAIL", `POST /api/topics/follow (no auth) — ${r.status}`); }
  else line("WARN", `POST /api/topics/follow (no auth) — got ${r.status}`);

  r = await hit("POST", "/api/brains", { body: { title: "test" } });
  if (r.status === 401 || r.status === 403) line("PASS", `POST /api/brains (no auth) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/brains no-auth", kind: "5XX", status: r.status }); line("FAIL", `POST /api/brains (no auth) — ${r.status}`); }
  else line("WARN", `POST /api/brains (no auth) — got ${r.status}`);

  r = await hit("DELETE", "/api/brains/fake-id");
  if (r.status === 401 || r.status === 403) line("PASS", `DELETE /api/brains/:id (no auth) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "DELETE /api/brains no-auth", kind: "5XX", status: r.status }); line("FAIL", `DELETE /api/brains/:id (no auth) — ${r.status}`); }
  else line("WARN", `DELETE /api/brains/:id (no auth) — got ${r.status}`);

  r = await hit("PUT", "/api/v1/skills", { body: { id: "x", title: "y" } });
  if (r.status === 401 || r.status === 403) line("PASS", `PUT /api/v1/skills (no auth) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "PUT /api/v1/skills no-auth", kind: "5XX", status: r.status }); line("FAIL", `PUT /api/v1/skills (no auth) — ${r.status}`); }
  else line("WARN", `PUT /api/v1/skills (no auth) — got ${r.status}`);

  r = await hit("DELETE", "/api/v1/skills/fake-id");
  if (r.status === 401 || r.status === 403) line("PASS", `DELETE /api/v1/skills/:id (no auth) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "DELETE /api/v1/skills no-auth", kind: "5XX", status: r.status }); line("FAIL", `DELETE /api/v1/skills/:id (no auth) — ${r.status}`); }
  else line("WARN", `DELETE /api/v1/skills/:id (no auth) — got ${r.status}`);

  r = await hit("PUT", "/api/v1/habits", { body: { id: "x", title: "y" } });
  if (r.status === 401 || r.status === 403) line("PASS", `PUT /api/v1/habits (no auth) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "PUT /api/v1/habits no-auth", kind: "5XX", status: r.status }); line("FAIL", `PUT /api/v1/habits (no auth) — ${r.status}`); }
  else line("WARN", `PUT /api/v1/habits (no auth) — got ${r.status}`);

  r = await hit("DELETE", "/api/v1/habits/fake-id");
  if (r.status === 401 || r.status === 403) line("PASS", `DELETE /api/v1/habits/:id (no auth) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "DELETE /api/v1/habits no-auth", kind: "5XX", status: r.status }); line("FAIL", `DELETE /api/v1/habits/:id (no auth) — ${r.status}`); }
  else line("WARN", `DELETE /api/v1/habits/:id (no auth) — got ${r.status}`);

  r = await hit("POST", "/api/posts/fake-id/react", { body: { type: "like" } });
  if (r.status === 401 || r.status === 403) line("PASS", `POST /api/posts/:id/react (no auth) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/posts/:id/react no-auth", kind: "5XX", status: r.status }); line("FAIL", `POST /api/posts/:id/react (no auth) — ${r.status}`); }
  else line("WARN", `POST /api/posts/:id/react (no auth) — got ${r.status}`);
}

// ============================================================
// PHASE D — Bad auth tokens (should 401, not 500)
// ============================================================
console.log("\n=== D. Bad auth tokens (should 401, not 500) ===");
{
  let r = await hit("POST", "/api/posts", { body: { content: "test" }, token: TOKEN_FAKE });
  if (r.status === 401 || r.status === 403) line("PASS", `POST /api/posts (fake token) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/posts fake-token", kind: "5XX", status: r.status }); line("FAIL", `POST /api/posts (fake token) — ${r.status}`); }
  else line("WARN", `POST /api/posts (fake token) — got ${r.status}`);

  r = await hit("PUT", "/api/v1/skills", { body: { id: "x" }, token: TOKEN_FAKE });
  if (r.status === 401 || r.status === 403) line("PASS", `PUT /api/v1/skills (fake token) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "PUT /api/v1/skills fake-token", kind: "5XX", status: r.status }); line("FAIL", `PUT /api/v1/skills (fake token) — ${r.status}`); }
  else line("WARN", `PUT /api/v1/skills (fake token) — got ${r.status}`);

  r = await hit("PUT", "/api/v1/habits", { body: { id: "x" }, token: TOKEN_FAKE });
  if (r.status === 401 || r.status === 403) line("PASS", `PUT /api/v1/habits (fake token) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "PUT /api/v1/habits fake-token", kind: "5XX", status: r.status }); line("FAIL", `PUT /api/v1/habits (fake token) — ${r.status}`); }
  else line("WARN", `PUT /api/v1/habits (fake token) — got ${r.status}`);

  // Malformed Authorization header
  r = await hit("POST", "/api/posts", { body: { content: "x" }, token: "NotABearerToken" });
  if (r.status === 401 || r.status === 403) line("PASS", `POST /api/posts (malformed auth) — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/posts malformed-auth", kind: "5XX", status: r.status }); line("FAIL", `POST /api/posts (malformed auth) — ${r.status}`); }
  else line("WARN", `POST /api/posts (malformed auth) — got ${r.status}`);
}

// ============================================================
// PHASE E — Malformed payloads (should 400, not 500)
// ============================================================
console.log("\n=== E. Malformed payloads (should 400, not 500) ===");
{
  // Empty body where body required
  let r = await hit("POST", "/api/posts", { body: {} });
  if (r.status === 400 || r.status === 401) line("PASS", `POST /api/posts {} — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/posts empty-body", kind: "5XX", status: r.status }); line("FAIL", `POST /api/posts {} — ${r.status}`); }
  else line("WARN", `POST /api/posts {} — got ${r.status}`);

  r = await hit("POST", "/api/topics", { body: {} });
  if (r.status === 400 || r.status === 401) line("PASS", `POST /api/topics {} — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/topics empty-body", kind: "5XX", status: r.status }); line("FAIL", `POST /api/topics {} — ${r.status}`); }
  else line("WARN", `POST /api/topics {} — got ${r.status}`);

  // Invalid types (string where object expected, etc.)
  r = await hit("POST", "/api/posts", { body: { content: 12345, type: "INVALID_TYPE" } });
  if (r.status === 400 || r.status === 401) line("PASS", `POST /api/posts bad-types — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/posts bad-types", kind: "5XX", status: r.status }); line("FAIL", `POST /api/posts bad-types — ${r.status}`); }
  else line("WARN", `POST /api/posts bad-types — got ${r.status}`);

  // Huge payload (10KB body)
  const huge = "x".repeat(1024 * 10);
  r = await hit("POST", "/api/posts", { body: { content: huge } });
  if (r.status === 200 || r.status === 201 || r.status === 400 || r.status === 401 || r.status === 413) line("PASS", `POST /api/posts huge-body — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/posts huge-body", kind: "5XX", status: r.status }); line("FAIL", `POST /api/posts huge-body — ${r.status}`); }
  else line("WARN", `POST /api/posts huge-body — got ${r.status}`);

  // Empty string content
  r = await hit("POST", "/api/posts", { body: { content: "" } });
  if (r.status === 400 || r.status === 401) line("PASS", `POST /api/posts empty-content — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/posts empty-content", kind: "5XX", status: r.status }); line("FAIL", `POST /api/posts empty-content — ${r.status}`); }
  else line("WARN", `POST /api/posts empty-content — got ${r.status}`);

  // Skills PUT with missing required fields
  r = await hit("PUT", "/api/v1/skills", { body: {} });
  if (r.status === 400 || r.status === 401) line("PASS", `PUT /api/v1/skills {} — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "PUT /api/v1/skills empty-body", kind: "5XX", status: r.status }); line("FAIL", `PUT /api/v1/skills {} — ${r.status}`); }
  else line("WARN", `PUT /api/v1/skills {} — got ${r.status}`);

  // Habits PUT with missing required fields
  r = await hit("PUT", "/api/v1/habits", { body: {} });
  if (r.status === 400 || r.status === 401) line("PASS", `PUT /api/v1/habits {} — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "PUT /api/v1/habits empty-body", kind: "5XX", status: r.status }); line("FAIL", `PUT /api/v1/habits {} — ${r.status}`); }
  else line("WARN", `PUT /api/v1/habits {} — got ${r.status}`);

  // Client-error report with bad payload
  r = await hit("POST", "/api/client-errors", { body: {} });
  if (r.status === 200 || r.status === 201 || r.status === 400) line("PASS", `POST /api/client-errors {} — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/client-errors empty-body", kind: "5XX", status: r.status }); line("FAIL", `POST /api/client-errors {} — ${r.status}`); }
  else line("WARN", `POST /api/client-errors {} — got ${r.status}`);

  // Events endpoint with bad payload
  r = await hit("POST", "/api/events", { body: {} });
  if (r.status === 200 || r.status === 201 || r.status === 400) line("PASS", `POST /api/events {} — ${r.status}`);
  else if (r.status >= 500) { bugs.push({ label: "POST /api/events empty-body", kind: "5XX", status: r.status }); line("FAIL", `POST /api/events {} — ${r.status}`); }
  else line("WARN", `POST /api/events {} — got ${r.status}`);
}

// ============================================================
// PHASE F — Edge-case query strings (should not 500)
// ============================================================
console.log("\n=== F. Edge-case query strings ===");
{
  const paths = [
    "/api/feed?topic=",
    "/api/feed?limit=0",
    "/api/feed?limit=-1",
    "/api/feed?limit=999999",
    "/api/feed?cursor=",
    "/api/feed?topic=" + encodeURIComponent("'; DROP TABLE posts; --"),
    "/api/topics?q=",
    "/api/v1/search/skills?q=",
    "/api/v1/search/skills?q=" + encodeURIComponent("<script>alert(1)</script>"),
    "/api/v1/search/skills?q=" + encodeURIComponent("a".repeat(10000)),
    "/api/v1/habits/search?q=" + encodeURIComponent("'OR'1'='1"),
    "/api/recommendations/brains?limit=0",
    "/api/recommendations/brains?topic=" + encodeURIComponent("nonexistent"),
    "/api/v1/datasets?cursor=invalid",
  ];
  for (const p of paths) {
    const r = await hit("GET", p);
    if (r.status >= 500) { bugs.push({ label: `GET ${p.slice(0, 80)}`, kind: "5XX", status: r.status }); line("FAIL", `GET ${p.slice(0, 80)}… — ${r.status}`); }
    else line("PASS", `GET ${p.slice(0, 60)}… — ${r.status}`);
  }
}

// ============================================================
// PHASE G — Concurrent burst (50 parallel requests to /api/feed)
// ============================================================
console.log("\n=== G. Concurrent burst (50 parallel /api/feed) ===");
{
  const N = 50;
  const t0 = performance.now();
  const rs = await Promise.all(Array.from({ length: N }, () => hit("GET", "/api/feed")));
  const dt = (performance.now() - t0).toFixed(1);
  const oks = rs.filter(r => r.status === 200).length;
  const errs = rs.filter(r => r.status >= 500).length;
  const crashes = rs.filter(r => r.status === 0).length;
  if (oks === N) line("PASS", `${N} parallel /api/feed — all 200 in ${dt}ms`);
  else if (errs === 0 && crashes === 0) line("WARN", `${N} parallel /api/feed — ${oks}/${N} 200 in ${dt}ms`);
  else { line("FAIL", `${N} parallel /api/feed — ${oks} ok, ${errs} 5xx, ${crashes} crash in ${dt}ms`); bugs.push({ label: "concurrent burst", kind: "5XX-burst", detail: `${errs} 5xx, ${crashes} crash` }); }
  if (oks > 0) {
    const avg = rs.reduce((a, r) => a + parseFloat(r.dt), 0) / oks;
    line("INFO", `avg latency ${avg.toFixed(1)}ms (target < 500ms)`);
  }
}

// ============================================================
// PHASE H — Mixed burst (different endpoints in parallel)
// ============================================================
console.log("\n=== H. Mixed burst (different endpoints in parallel) ===");
{
  const paths = [
    "GET /api/healthz",
    "GET /api/ready",
    "GET /api/feed",
    "GET /api/topics",
    "GET /api/brains",
    "GET /api/v1/skills",
    "GET /api/v1/habits",
    "GET /api/intelligence/summary",
    "GET /api/recommendations/brains",
    "GET /api/v1/datasets",
    "GET /api/events/summary",
    "GET /api/v1/search/skills?q=math",
    "GET /api/v1/search?q=brain",
    "POST /api/client-errors",
    "POST /api/events",
  ];
  const N = 30;
  const t0 = performance.now();
  const rs = await Promise.all(Array.from({ length: N }, (_, i) => {
    const [m, p] = paths[i % paths.length].split(" ");
    const body = m === "POST" ? { kind: "burst-test", idx: i } : undefined;
    return hit(m, p, body ? { body } : {});
  }));
  const dt = (performance.now() - t0).toFixed(1);
  const oks = rs.filter(r => r.status < 400).length;
  const errs5 = rs.filter(r => r.status >= 500).length;
  if (errs5 === 0) line("PASS", `${N} mixed-burst — ${oks}/${N} ok in ${dt}ms (no 5xx)`);
  else { line("FAIL", `${N} mixed-burst — ${errs5} 5xx in ${dt}ms`); bugs.push({ label: "mixed burst", kind: "5XX", detail: `${errs5} 5xx` }); }
}

// ============================================================
// PHASE I — Server still alive after stress
// ============================================================
console.log("\n=== I. Server still alive after stress ===");
{
  const r = await hit("GET", "/api/healthz");
  if (r.status === 200 && r.body?.status === "ok") line("PASS", `Server still healthy post-stress — uptime=${r.body.uptime?.toFixed(0)}s`);
  else { line("FAIL", `Server unhealthy post-stress — status=${r.status}`); bugs.push({ label: "post-stress health", kind: "DEAD", detail: r.err ?? r.raw }); }
}

// ============================================================
// SUMMARY
// ============================================================
console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  SUMMARY: ${pass} PASS · ${fail} FAIL · ${warn} WARN`);
if (bugs.length > 0) {
  console.log("\n  BUGS FOUND:");
  for (const b of bugs) {
    console.log(`    [${b.kind}] ${b.label}${b.status ? ` (${b.status})` : ""}${b.detail ? ` — ${b.detail}` : ""}${b.body ? ` — ${b.body}` : ""}`);
  }
} else {
  console.log("\n  ✓ No 5xx errors, no crashes, no real bugs found.");
}
console.log("══════════════════════════════════════════════════════════════\n");
process.exit(bugs.length > 0 ? 1 : 0);
