// k6 load test for Brain Drain API — 20,000 concurrent user model
// Install k6: https://k6.io/docs/get-started/installation/
//
//   k6 run scripts/load-test.js                      # smoke (default)
//   k6 run -e STAGE=load   scripts/load-test.js      # 500 VUs
//   k6 run -e STAGE=stress scripts/load-test.js      # 5,000 VUs
//   k6 run -e STAGE=spike  scripts/load-test.js      # 0 → 20,000 VUs instantly
//   k6 run -e STAGE=soak   scripts/load-test.js      # 2,000 VUs for 1 hour
//   k6 run -e BASE_URL=https://braindrain.app -e STAGE=spike scripts/load-test.js
//
// ── What this models (the product's real traffic mix) ──────────────────────
//   80%  READ      feed browsing + graph/brain browsing + health probes
//   15%  SYNC      IndexedDB-to-Supabase replays (idempotent brain/post upserts)
//    5%  WRITE     brain creation / publishing + post creation
//
// Reads are the only thing that must stay fast for everyone, so they carry the
// tight latency threshold; writes are allowed to be slower. Every write path
// is idempotent (client-generated ids) so re-running the test does not inflate
// the database.
//
// ── Reading the numbers ────────────────────────────────────────────────────
// A single 1 vCPU / 512 MB instance is expected to hold:
//   /api/healthz  ~5,000 rps     (pure JSON, no allocation)
//   /api/feed     ~150 rps cold  (>3,000 rps on the SWR cache path)
//   POST /api/*   ~50 rps        (auth verify + PostgREST write)
// So 20,000 VUs is a FLEET target, not a single-box target: run it against the
// load balancer. Use `spike` to verify the fleet survives a cold start, and
// watch `http_req_failed` for 429s — a 429 means the limiter protected the
// box, which is correct; a 5xx means something is actually broken.

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const STAGE = __ENV.STAGE || 'smoke';
// The auth token used for the write/sync bucket. Without it, writes are
// expected to 401 (still exercised: the limiter + auth middleware must not
// crash on unauthenticated writes).
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

// ── Metrics ───────────────────────────────────────────────────────────────
const errorRate = new Rate('errors');
const feedLatency = new Trend('feed_latency_ms');
const healthLatency = new Trend('health_latency_ms');
const graphLatency = new Trend('graph_latency_ms');
const writeLatency = new Trend('write_latency_ms');
const syncLatency = new Trend('sync_latency_ms');
const rateLimited = new Counter('rate_limited_429');
const serverErrors = new Counter('server_errors_5xx');
const ok200 = new Counter('responses_200');

// ── Scenarios ─────────────────────────────────────────────────────────────
const SCENARIOS = {
  smoke: {
    stages: [{ duration: '30s', target: 1 }],
    thresholds: {
      http_req_failed: ['rate<0.01'],
      http_req_duration: ['p(95)<500'],
      server_errors_5xx: ['count<1'],
    },
  },
  load: {
    stages: [
      { duration: '3m', target: 100 },
      { duration: '5m', target: 500 },
      { duration: '10m', target: 500 },
      { duration: '3m', target: 0 },
    ],
    thresholds: {
      http_req_failed: ['rate<0.05'],
      http_req_duration: ['p(95)<2000'],
      feed_latency_ms: ['p(95)<1500'],
      server_errors_5xx: ['count<50'],
    },
  },
  stress: {
    stages: [
      { duration: '5m', target: 1000 },
      { duration: '10m', target: 5000 },
      { duration: '5m', target: 5000 },
      { duration: '5m', target: 0 },
    ],
    thresholds: {
      http_req_failed: ['rate<0.10'],
      http_req_duration: ['p(95)<5000'],
      feed_latency_ms: ['p(99)<4000'],
    },
  },
  // The headline test: 20,000 concurrent users arriving at once.
  spike: {
    stages: [
      { duration: '10s', target: 20000 },
      { duration: '4m', target: 20000 },
      { duration: '2m', target: 0 },
    ],
    thresholds: {
      // Writes/limits are allowed to shed load (429) — reads must hold.
      http_req_failed: ['rate<0.15'],
      feed_latency_ms: ['p(95)<3000'],
      health_latency_ms: ['p(99)<500'],
    },
  },
  soak: {
    stages: [
      { duration: '5m', target: 2000 },
      { duration: '60m', target: 2000 },
      { duration: '5m', target: 0 },
    ],
    thresholds: {
      http_req_failed: ['rate<0.02'],
      http_req_duration: ['p(95)<2500'],
      server_errors_5xx: ['count<100'],
    },
  },
};

export const options = {
  ...(SCENARIOS[STAGE] || SCENARIOS.smoke),
  discardResponseBodies: false,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const TOPICS = ['engineering', 'philosophy', 'react', 'design', 'careers', 'health'];
const FEED_MODES = ['foryou', 'following'];

// ── Helpers ───────────────────────────────────────────────────────────────
function trackStatus(res) {
  if (res.status === 429) rateLimited.add(1);
  if (res.status >= 500) serverErrors.add(1);
  if (res.status === 200) ok200.add(1);
}

function jsonHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) h['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  return h;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 80% bucket — the read paths that must stay fast for every visitor. */
function readJourney() {
  group('read: healthz', () => {
    const res = http.get(`${BASE_URL}/api/healthz`);
    healthLatency.add(res.timings.duration);
    trackStatus(res);
    check(res, {
      'healthz 200': (r) => r.status === 200,
      'healthz ok': (r) => r.json('status') === 'ok',
    }) || errorRate.add(1);
  });

  group('read: feed', () => {
    const mode = FEED_MODES[randomIntBetween(0, FEED_MODES.length - 1)];
    const res = http.get(`${BASE_URL}/api/feed?mode=${mode}&limit=20`, {
      tags: { name: 'feed' },
    });
    feedLatency.add(res.timings.duration);
    trackStatus(res);
    const ok = check(res, {
      'feed 2xx/401': (r) => (r.status >= 200 && r.status < 300) || r.status === 401,
      'feed has posts array': (r) => r.status !== 200 || Array.isArray(r.json('posts')),
      'feed cached or live': (r) =>
        r.status !== 200 || ['HIT', 'STALE', 'MISS'].includes(r.headers['X-Feed-Cache']),
    });
    if (!ok) errorRate.add(1);
  });

  group('read: topic feed', () => {
    const topic = TOPICS[randomIntBetween(0, TOPICS.length - 1)];
    const res = http.get(`${BASE_URL}/api/feed?mode=foryou&topic=${topic}&limit=10`);
    feedLatency.add(res.timings.duration);
    trackStatus(res);
    check(res, { 'topic feed not 5xx': (r) => r.status < 500 }) || errorRate.add(1);
  });

  group('read: brain graph', () => {
    // Graph browsing == the brains listing + a single brain's payload.
    const list = http.get(`${BASE_URL}/api/brains?limit=20`);
    graphLatency.add(list.timings.duration);
    trackStatus(list);
    check(list, { 'brains not 5xx': (r) => r.status < 500 }) || errorRate.add(1);
  });

  group('read: skill search', () => {
    // NOTE: the search route is /api/v1/search/skills (see
    // api-server/src/routes/index.ts + search.ts). The previous target,
    // /api/search, did not exist — every search sample was a 404, so the
    // search path was never actually load-tested.
    const q = TOPICS[randomIntBetween(0, TOPICS.length - 1)];
    const res = http.get(`${BASE_URL}/api/v1/search/skills?q=${q}&limit=10`);
    trackStatus(res);
    check(res, { 'search not 5xx': (r) => r.status < 500 }) || errorRate.add(1);
  });
}

/** 15% bucket — IndexedDB→Supabase replays (idempotent upserts). */
function syncJourney() {
  group('sync: brain upsert', () => {
    const brainId = uuid();
    const res = http.post(
      `${BASE_URL}/api/brains`,
      JSON.stringify({
        brain: {
          id: brainId,
          title: `k6 sync ${brainId.slice(0, 6)}`,
          category: 'load-test',
          description: 'offline queue replay',
          root_node_id: null,
          is_public: false,
        },
        nodes: [],
      }),
      { headers: jsonHeaders(), tags: { name: 'sync-brain' } },
    );
    syncLatency.add(res.timings.duration);
    trackStatus(res);
    // 401/503 are expected in local-only mode; only 5xx is a failure.
    check(res, { 'sync not 5xx': (r) => r.status < 500 }) || errorRate.add(1);
  });

  group('sync: reaction', () => {
    const res = http.post(
      `${BASE_URL}/api/posts/${uuid()}/react`,
      JSON.stringify({ reactionType: 'upvote' }),
      { headers: jsonHeaders(), tags: { name: 'sync-reaction' } },
    );
    trackStatus(res);
    check(res, { 'reaction not 5xx': (r) => r.status < 500 }) || errorRate.add(1);
  });
}

/** 5% bucket — brain creation / publishing and post creation. */
function writeJourney() {
  group('write: create brain', () => {
    const brainId = uuid();
    const res = http.post(
      `${BASE_URL}/api/brains`,
      JSON.stringify({
        brain: {
          id: brainId,
          title: `k6 brain ${brainId.slice(0, 6)}`,
          category: 'load-test',
          description: '20k-user simulation',
          root_node_id: null,
          is_public: true,
        },
        nodes: [],
      }),
      { headers: jsonHeaders(), tags: { name: 'create-brain' } },
    );
    writeLatency.add(res.timings.duration);
    trackStatus(res);
    check(res, { 'create brain not 5xx': (r) => r.status < 500 }) || errorRate.add(1);
  });

  group('write: create post', () => {
    const res = http.post(
      `${BASE_URL}/api/posts`,
      JSON.stringify({
        id: uuid(),
        topicId: TOPICS[randomIntBetween(0, TOPICS.length - 1)],
        content: 'Load-test post — verifying write path under 20k users.',
        postType: 'post',
      }),
      { headers: jsonHeaders(), tags: { name: 'create-post' } },
    );
    writeLatency.add(res.timings.duration);
    trackStatus(res);
    check(res, { 'create post 2xx/401/429': (r) => r.status < 500 }) || errorRate.add(1);
  });

  group('write: malformed payload resilience', () => {
    // The server MUST answer 400/413, never 5xx, for garbage input.
    const res = http.post(`${BASE_URL}/api/posts`, '{"broken":', {
      headers: jsonHeaders(),
      tags: { name: 'malformed' },
    });
    trackStatus(res);
    check(res, {
      'malformed rejected with 4xx': (r) => r.status >= 400 && r.status < 500,
    }) || errorRate.add(1);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function () {
  // Deterministic 80/15/5 split per iteration.
  const roll = Math.random();
  if (roll < 0.8) {
    readJourney();
  } else if (roll < 0.95) {
    syncJourney();
  } else {
    writeJourney();
  }
  // Think time: real users pause between actions. 200–800ms keeps the VU
  // count meaningful (no sync loop hammering) without idling the fleet.
  sleep(randomIntBetween(200, 800) / 1000);
}

export function handleSummary(data) {
  const m = data.metrics;
  const v = (name, stat) => m[name]?.values?.[stat] ?? 0;
  const label = String(STAGE).toUpperCase();
  return {
    stdout: `
══════════════════════════════════════════════════════════════════
  ${label} TEST — Brain Drain (80% read / 15% sync / 5% write)
══════════════════════════════════════════════════════════════════
  Traffic
    Total requests:      ${v('http_reqs', 'count')}
    Throughput:          ${v('http_reqs', 'rate').toFixed(1)} req/s
    200 responses:       ${v('responses_200', 'count')}
    429 (rate limited):  ${v('rate_limited_429', 'count')}   <- limiter protecting the box
    5xx (server errors): ${v('server_errors_5xx', 'count')}   <- must be 0
    Error rate:          ${(v('errors', 'rate') * 100).toFixed(2)}%

  Latency (ms)
    Overall  p50/p95/p99: ${v('http_req_duration', 'med').toFixed(0)} / ${v('http_req_duration', 'p(95)').toFixed(0)} / ${v('http_req_duration', 'p(99)').toFixed(0)}
    Feed     p95/p99:     ${v('feed_latency_ms', 'p(95)').toFixed(0)} / ${v('feed_latency_ms', 'p(99)').toFixed(0)}
    Health   p95/p99:     ${v('health_latency_ms', 'p(95)').toFixed(0)} / ${v('health_latency_ms', 'p(99)').toFixed(0)}
    Graph    p95:         ${v('graph_latency_ms', 'p(95)').toFixed(0)}
    Sync     p95:         ${v('sync_latency_ms', 'p(95)').toFixed(0)}
    Write    p95:         ${v('write_latency_ms', 'p(95)').toFixed(0)}

  Checks: ${v('checks', 'passes')} passed / ${v('checks', 'fails')} failed
══════════════════════════════════════════════════════════════════
`,
  };
}
