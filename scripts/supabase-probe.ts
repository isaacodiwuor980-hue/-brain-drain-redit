/**
 * Safe read-only Supabase connectivity + schema readiness probe.
 *
 * Verifies what "configured" actually means at runtime:
 *   1. Env vars present (config.isConfigured)
 *   2. REST API reachable (GET /rest/v1/ with apikey)
 *   3. Required tables exist and are queryable
 *   4. Row counts for the tables the feed depends on
 *
 * READ-ONLY: only SELECT queries. No writes, no migrations, no DDL.
 * Uses the same config + service-role key the server already uses
 * (never logs the key).
 */
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function redact(s: string | undefined): string {
  if (!s) return "<unset>";
  if (s.length < 12) return "<set,too-short>";
  return `<set, len=${s.length}, prefix=${s.slice(0, 4)}…>`;
}

console.log("=== Supabase connectivity probe (READ-ONLY) ===\n");
console.log("1. Env var presence (values redacted):");
console.log("   SUPABASE_URL:", SUPABASE_URL ? `<set, len=${SUPABASE_URL.length}, host=${new URL(SUPABASE_URL).host}>` : "<unset>");
console.log("   SUPABASE_SERVICE_ROLE_KEY:", redact(SERVICE_KEY));

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.log("\n✗ NOT CONFIGURED — cannot probe");
  process.exit(1);
}

const restBase = `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1`;
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function probeTable(name: string) {
  const start = Date.now();
  try {
    const res = await fetch(`${restBase}/${name}?select=id&limit=5`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    const elapsed = Date.now() - start;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { table: name, ok: false, status: res.status, elapsed, error: body.slice(0, 200) };
    }
    const data = await res.json();
    return { table: name, ok: true, status: res.status, elapsed, sampleCount: Array.isArray(data) ? data.length : null };
  } catch (e: any) {
    return { table: name, ok: false, status: 0, elapsed: Date.now() - start, error: `${e.name}: ${e.message}`.slice(0, 200) };
  }
}

async function countRows(name: string) {
  try {
    const res = await fetch(`${restBase}/${name}?select=id&limit=1000`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { table: name, count: null, status: res.status };
    const data = await res.json();
    return { table: name, count: Array.isArray(data) ? data.length : null, status: res.status };
  } catch (e: any) {
    return { table: name, count: null, error: e.message };
  }
}

console.log("\n2. REST API reachability + per-table query:");
const tables = ["posts", "topics", "profiles", "reactions", "comments", "minds", "pathways"];
const results = [];
for (const t of tables) {
  const r = await probeTable(t);
  results.push(r);
  const tag = r.ok ? "✓" : "✗";
  console.log(`   ${tag} ${t}: status=${r.status} elapsed=${r.elapsed}ms ${r.ok ? `rows=${r.sampleCount}` : `error=${r.error}`}`);
}

console.log("\n3. Row counts (limit 1000 — exact for small tables):");
for (const t of ["posts", "topics", "profiles", "reactions", "comments"]) {
  const c = await countRows(t);
  console.log(`   ${t}: ${c.count ?? "n/a"} rows (status ${c.status})`);
}

console.log("\n4. Summary:");
const reachable = results.filter(r => r.ok).map(r => r.table);
const missing = results.filter(r => !r.ok && r.status === 404).map(r => r.table);
const errored = results.filter(r => !r.ok && r.status !== 404).map(r => `${r.table}(status ${r.status})`);
console.log("   Reachable tables:", reachable.length ? reachable.join(", ") : "(none)");
console.log("   Missing (404 — table does not exist):", missing.length ? missing.join(", ") : "(none)");
console.log("   Other errors:", errored.length ? errored.join(", ") : "(none)");

if (missing.length > 0) {
  console.log("\n⚠ SCHEMA NOT READY — tables missing. A migration is likely pending.");
  process.exit(2);
}
if (reachable.length === tables.length) {
  console.log("\n✓ Supabase CONNECTED and required tables exist.");
  process.exit(0);
}
process.exit(1);
