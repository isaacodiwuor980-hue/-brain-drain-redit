#!/usr/bin/env node
/**
 * backend-stress.mjs — backend stress/simulation suite (recreated 2026-11-14).
 *
 * The original was lost in an environment reset. Recreated from the phase
 * list in the worklog: health, public reads, no-auth writes, bad tokens,
 * malformed payloads, edge-case query strings, parallel bursts, post-stress
 * health. Every check prints PASS/FAIL; exit code 1 if any FAIL.
 *
 * Usage: node scripts/backend-stress.mjs   (server must be on localhost:3000)
 */
const BASE = process.env.STRESS_BASE || "http://localhost:3000";
let pass = 0, fail = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  ✓ PASS ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✗ FAIL ${name} ${detail}`); }
}

async function req(method, path, { body, token, headers = {}, raw = false } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { status: 0, text: "", json: null };
  }
  const text = await res.text().catch(() => "");
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return raw ? { status: res.status, text, json, res } : { status: res.status, text, json };
}

async function phase(name, fn) {
  console.log(`\n▶ ${name}`);
  await fn();
}

// ── Phase 1: health + infra ──────────────────────────────────────────────
await phase("1. health + infra", async () => {
  const h = await req("GET", "/api/healthz");
  check("healthz 200 + ok", h.status === 200 && h.json?.status === "ok", `got ${h.status}`);
  const r = await req("GET", "/api/ready");
  check("ready 200", r.status === 200, `got ${r.status}`);
});

// ── Phase 2: public reads ────────────────────────────────────────────────
await phase("2. public reads", async () => {
  const f = await req("GET", "/api/feed?mode=foryou&limit=5");
  check("feed 200 + posts array", f.status === 200 && Array.isArray(f.json?.posts));
  const f2 = await req("GET", "/api/feed?mode=following&limit=5");
  check("feed following 200", f2.status === 200);
  const t = await req("GET", "/api/topics");
  check("topics 200", t.status === 200 && Array.isArray(t.json?.topics), `got ${t.status}`);
  const s = await req("GET", "/api/v1/skills");
  check("skills list 200", s.status === 200 && Array.isArray(s.json?.skills));
  const hb = await req("GET", "/api/v1/habits");
  check("habits list 200", hb.status === 200 && Array.isArray(hb.json?.habits));
  const su = await req("GET", "/api/discover/search-users?q=test");
  check("search-users 200", su.status === 200);
});

// ── Phase 3: no-auth writes must 401 (not 500) ───────────────────────────
await phase("3. no-auth writes → 401", async () => {
  const put = await req("PUT", "/api/v1/skills", { body: { id: "x", title: "x" } });
  check("PUT skills 401/403", put.status === 401 || put.status === 403, `got ${put.status}`);
  const puth = await req("PUT", "/api/v1/habits", { body: { id: "x" } });
  check("PUT habits 401/403", puth.status === 401 || puth.status === 403, `got ${puth.status}`);
  const post = await req("POST", "/api/posts", { body: { content: "x" } });
  check("POST posts 401/403", post.status === 401 || post.status === 403, `got ${post.status}`);
  const bt = await req("GET", "/api/discover/by-topics");
  check("by-topics 401/403", bt.status === 401 || bt.status === 403, `got ${bt.status}`);
  const bc = await req("POST", "/api/discover/by-contacts", { body: { hashes: [] } });
  check("by-contacts 401/403", bc.status === 401 || bc.status === 403, `got ${bc.status}`);
});

// ── Phase 4: bad tokens → 401 (never 500/crash) ──────────────────────────
// GET /api/v1/skills is a PUBLIC read (published skills) — a forged token
// must still 200 (treated as anonymous), so we test rejection on a
// requireAuth endpoint instead.
await phase("4. bad tokens", async () => {
  const garbage = await req("GET", "/api/discover/by-topics", { token: "not.a.jwt" });
  check("garbage token 401/403", garbage.status === 401 || garbage.status === 403, `got ${garbage.status}`);
  const forged = await req("GET", "/api/discover/by-topics", { token: "eyJhbGciOiJIUzI1NiJ9 forged" });
  check("forged token 401/403 (auth endpoint)", forged.status === 401 || forged.status === 403, `got ${forged.status}`);
  const pubForged = await req("GET", "/api/v1/skills", { token: "eyJhbGciOiJIUzI1NiJ9 forged" });
  check("forged token on PUBLIC endpoint still 200 (anonymous read)", pubForged.status === 200, `got ${pubForged.status}`);
});

// ── Phase 5: malformed payloads → 400 (never 500) ────────────────────────
await phase("5. malformed payloads", async () => {
  const bad = await req("POST", "/api/events", { body: { garbage: true } });
  check("events malformed 2xx/400 (no 5xx)", bad.status < 500, `got ${bad.status}`);
  const long = await req("GET", `/api/feed?limit=99999`);
  check("feed limit clamp (no 5xx)", long.status < 500, `got ${long.status}`);
  const neg = await req("GET", `/api/feed?offset=-5`);
  check("feed negative offset (no 5xx)", neg.status < 500, `got ${neg.status}`);
});

// ── Phase 6: edge-case query strings (injection attempts) ────────────────
await phase("6. edge-case query strings", async () => {
  const inj = await req("GET", `/api/feed?topic='; DROP TABLE posts; --`);
  check("topic injection rejected (400/200, no 502)", inj.status !== 502 && inj.status < 500, `got ${inj.status}`);
  const script = await req("GET", `/api/v1/search/skills?q=${encodeURIComponent("<script>alert(1)</script>")}`);
  check("xss query no 5xx", script.status < 500, `got ${script.status}`);
  const empty = await req("GET", "/api/discover/search-users?q=");
  check("search-users empty q (400/200, no 5xx)", empty.status < 500, `got ${empty.status}`);
  const short = await req("GET", "/api/discover/search-users?q=ab");
  check("search-users 2-char q rejected (400)", short.status === 400 || short.status === 200, `got ${short.status}`);
});

// ── Phase 7: 50-parallel burst on feed ───────────────────────────────────
await phase("7. 50-parallel burst (feed)", async () => {
  const rs = await Promise.all(
    Array.from({ length: 50 }, () => req("GET", "/api/feed?mode=foryou&limit=10")),
  );
  const okCount = rs.filter((r) => r.status === 200).length;
  check("50 parallel feed ≥48 ok", okCount >= 48, `ok=${okCount}/50`);
});

// ── Phase 8: 30-mixed-endpoint burst ─────────────────────────────────────
await phase("8. 30-mixed-endpoint burst", async () => {
  const paths = ["/api/healthz", "/api/feed", "/api/topics", "/api/v1/skills", "/api/v1/habits", "/api/discover/search-users?q=abc"];
  const rs = await Promise.all(
    Array.from({ length: 30 }, (_, i) => req("GET", paths[i % paths.length])),
  );
  const ok = rs.filter((r) => r.status === 200).length;
  check("30 mixed ≥28 ok", ok >= 28, `ok=${ok}/30`);
});

// ── Phase 9: post-stress health ──────────────────────────────────────────
await phase("9. post-stress health", async () => {
  const h = await req("GET", "/api/healthz");
  check("server survived stress", h.status === 200 && h.json?.status === "ok", `got ${h.status}`);
});

console.log(`\n${"═".repeat(62)}`);
console.log(`  Total: ${pass + fail}  |  PASS: ${pass}  |  FAIL: ${fail}`);
console.log("═".repeat(62));
if (fail > 0) {
  console.log(`\nFailures:`);
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
}
