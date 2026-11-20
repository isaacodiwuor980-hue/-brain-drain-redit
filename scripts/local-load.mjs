#!/usr/bin/env node
/**
 * local-load.mjs — dependency-free load/spike harness for the Brain Drain API.
 *
 * k6 needs a separate binary; this script needs only Node 20+, so the
 * 80/15/5 traffic model can be reproduced inside CI or a sandbox where k6
 * isn't available. Use scripts/load-test.js (k6) for the authoritative
 * fleet-scale run; use this to sanity-check a single instance before deploy.
 *
 * Usage:
 *   node scripts/local-load.mjs                     # 200 concurrent, 15s
 *   CONCURRENCY=1000 DURATION=20 node scripts/local-load.mjs
 *   TARGET=http://localhost:3000 node scripts/local-load.mjs
 *
 * Traffic mix mirrors the k6 script exactly:
 *   80% read (healthz / feed / topic feed / brains / search)
 *   15% sync replay (idempotent brain upsert + reaction)
 *    5% write (brain create/publish + post create + malformed payload)
 */

const TARGET = process.env.TARGET || "http://localhost:3100";
const CONCURRENCY = Number(process.env.CONCURRENCY || 200);
const DURATION_MS = Number(process.env.DURATION || 15) * 1000;

const TOPICS = ["engineering", "philosophy", "react", "design", "careers", "health"];

const stats = {
  requests: 0,
  ok: 0,
  clientErrors: 0, // 4xx (429 included — the limiter working as intended)
  serverErrors: 0,
  networkErrors: 0,
  latencies: [],
  byRoute: {},
};

function record(route, status, ms, networkError = false) {
  stats.requests += 1;
  const bucket = (stats.byRoute[route] ||= { count: 0, errors: 0, latencies: [] });
  bucket.count += 1;
  bucket.latencies.push(ms);
  if (networkError) {
    stats.networkErrors += 1;
    bucket.errors += 1;
    return;
  }
  if (status >= 500) {
    stats.serverErrors += 1;
    bucket.errors += 1;
  } else if (status >= 400) {
    stats.clientErrors += 1;
  } else {
    stats.ok += 1;
  }
  stats.latencies.push(ms);
}

async function hit(route, path, init = {}) {
  const started = performance.now();
  try {
    const res = await fetch(`${TARGET}${path}`, init);
    // Drain the body so the socket is released (otherwise the harness leaks
    // connections and measures the wrong thing).
    await res.arrayBuffer();
    record(route, res.status, performance.now() - started);
    return res;
  } catch {
    record(route, 0, performance.now() - started, true);
    return null;
  }
}

const uuid = () => crypto.randomUUID();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function readJourney() {
  await hit("healthz", "/api/healthz");
  await hit("feed", `/api/feed?mode=${pick(["foryou", "following"])}&limit=20`);
  await hit("feed-topic", `/api/feed?mode=foryou&topic=${pick(TOPICS)}&limit=10`);
  await hit("brains", "/api/brains?limit=20");
  await hit("skill-search", `/api/v1/search/skills?q=${pick(TOPICS)}&limit=10`);
}

async function syncJourney() {
  const id = uuid();
  await hit("sync-brain", "/api/brains", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brain: {
        id,
        title: `local-load ${id.slice(0, 6)}`,
        category: "load-test",
        description: "queue replay",
        root_node_id: null,
        is_public: false,
      },
      nodes: [],
    }),
  });
  await hit("sync-reaction", `/api/posts/${uuid()}/react`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reactionType: "upvote" }),
  });
}

async function writeJourney() {
  const id = uuid();
  await hit("create-brain", "/api/brains", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      brain: { id, title: `brain ${id.slice(0, 6)}`, category: "load-test", description: "", root_node_id: null, is_public: true },
      nodes: [],
    }),
  });
  await hit("create-post", "/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: uuid(), topicId: pick(TOPICS), content: "load test", postType: "post" }),
  });
  // Malformed payload: the server must answer 4xx, never 5xx.
  await hit("malformed", "/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"broken":',
  });
}

async function virtualUser(deadline) {
  while (Date.now() < deadline) {
    const roll = Math.random();
    if (roll < 0.8) await readJourney();
    else if (roll < 0.95) await syncJourney();
    else await writeJourney();
    // Think time (100–400ms) so the harness models users, not a spin loop.
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 300));
  }
}

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const startedAt = Date.now();
const deadline = startedAt + DURATION_MS;

console.log(`\n▶ local-load: ${CONCURRENCY} concurrent users, ${DURATION_MS / 1000}s, target ${TARGET}`);
console.log("  80% read / 15% sync / 5% write\n");

await Promise.all(Array.from({ length: CONCURRENCY }, () => virtualUser(deadline)));

const elapsed = (Date.now() - startedAt) / 1000;
const sorted = [...stats.latencies].sort((a, b) => a - b);
const rps = stats.requests / elapsed;
const failRate = stats.requests === 0 ? 1 : (stats.serverErrors + stats.networkErrors) / stats.requests;

console.log("══════════════════════════════════════════════════════════════");
console.log(`  Requests:      ${stats.requests}  (${rps.toFixed(1)} req/s over ${elapsed.toFixed(1)}s)`);
console.log(`  2xx:           ${stats.ok}`);
console.log(`  4xx (expected):${String(stats.clientErrors).padStart(5)}   <- includes 401/429; not a failure`);
console.log(`  5xx:           ${stats.serverErrors}   <- MUST be 0`);
console.log(`  Network errors:${stats.networkErrors}`);
console.log(`  Failure rate:  ${(failRate * 100).toFixed(2)}%`);
console.log(`  Latency  p50/p95/p99: ${pct(sorted, 50).toFixed(0)} / ${pct(sorted, 95).toFixed(0)} / ${pct(sorted, 99).toFixed(0)} ms`);
console.log("  Per-route p95:");
for (const [route, bucket] of Object.entries(stats.byRoute).sort()) {
  const l = [...bucket.latencies].sort((a, b) => a - b);
  console.log(
    `    ${route.padEnd(14)} n=${String(bucket.count).padStart(6)}  p95=${pct(l, 95).toFixed(0)}ms  err=${bucket.errors}`,
  );
}
console.log("══════════════════════════════════════════════════════════════\n");

// Exit non-zero when the server actually broke — makes this CI-usable.
process.exit(stats.serverErrors === 0 ? 0 : 1);
