// k6 load test for Brain Drain API
// Install k6: https://k6.io/docs/get-started/installation/
// Run: k6 run scripts/load-test.js
//
// Expected throughput (single instance, 1 vCPU, 512MB):
//   - /api/healthz: ~5000 req/s (cheap JSON)
//   - /api/feed: ~150 req/s (Supabase round-trip)
//   - /api/posts (POST): ~50 req/s (auth verify + DB write)
//
// Usage:
//   k6 run scripts/load-test.js
//   k6 run -e BASE_URL=https://braindrain.app scripts/load-test.js
//   k6 run -e STAGE=ramp scripts/load-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const STAGE = __ENV.STAGE || 'smoke';

// Custom metrics
const errorRate = new Rate('errors');
const feedLatency = new Trend('feed_latency_ms');
const healthLatency = new Trend('health_latency_ms');

// Test stages — pick with STAGE env var.
const stages = {
  // Smoke test: 1 user, 30s. Verifies the server is reachable.
  smoke: {
    stages: [{ duration: '30s', target: 1 }],
    thresholds: {
      http_req_failed: ['rate<0.01'],
      http_req_duration: ['p(95)<500'],
    },
  },
  // Load test: ramp to 100 users over 5 min, hold 10 min, ramp down.
  load: {
    stages: [
      { duration: '5m', target: 100 },
      { duration: '10m', target: 100 },
      { duration: '5m', target: 0 },
    ],
    thresholds: {
      http_req_failed: ['rate<0.05'],
      http_req_duration: ['p(95)<2000'],
      feed_latency_ms: ['p(95)<1500'],
    },
  },
  // Stress test: ramp to 500 users over 5 min, hold 5 min.
  stress: {
    stages: [
      { duration: '5m', target: 500 },
      { duration: '5m', target: 500 },
      { duration: '5m', target: 0 },
    ],
    thresholds: {
      http_req_failed: ['rate<0.10'],
      http_req_duration: ['p(95)<5000'],
    },
  },
  // Spike test: 0 → 1000 users instantly, hold 2 min.
  spike: {
    stages: [
      { duration: '0m', target: 1000 },
      { duration: '2m', target: 1000 },
      { duration: '5m', target: 0 },
    ],
    thresholds: {
      http_req_failed: ['rate<0.20'],
    },
  },
};

export const options = stages[STAGE] || stages.smoke;

export default function () {
  // Health check — should be near-instant.
  const healthRes = http.get(`${BASE_URL}/api/healthz`);
  healthLatency.add(healthRes.timings.duration);
  const healthOk = check(healthRes, {
    'healthz status 200': (r) => r.status === 200,
    'healthz has status field': (r) => r.json('status') === 'ok',
  });
  errorRate.add(!healthOk);

  sleep(0.5);

  // Feed — the main read path. Without auth, this returns degraded mode
  // (empty posts) but still exercises the route + rate limiter.
  const feedRes = http.get(`${BASE_URL}/api/feed?mode=foryou&limit=20`);
  feedLatency.add(feedRes.timings.duration);
  const feedOk = check(feedRes, {
    'feed status 200': (r) => r.status === 200,
    'feed has posts array': (r) => {
      const body = r.json();
      return Array.isArray(body?.posts);
    },
  });
  errorRate.add(!feedOk);

  sleep(1);

  // Static asset — verify the CDN/static path is fast.
  const assetRes = http.get(`${BASE_URL}/favicon.svg`);
  const assetOk = check(assetRes, {
    'asset status 200': (r) => r.status === 200,
  });
  errorRate.add(!assetOk);

  sleep(1);
}

// Summary handler — prints a human-readable report at the end.
export function handleSummary(data) {
  const stats = {
    smoke: 'SMOKE',
    load: 'LOAD',
    stress: 'STRESS',
    spike: 'SPIKE',
  };
  const label = stats[STAGE] || 'SMOKE';

  return {
    stdout: `
══════════════════════════════════════════════════════════
  ${label} TEST — Summary
══════════════════════════════════════════════════════════
  Total requests:      ${data.metrics.http_reqs?.values?.count || 0}
  Error rate:          ${(data.metrics.errors?.values?.rate * 100 || 0).toFixed(2)}%
  Avg latency:         ${(data.metrics.http_req_duration?.values?.avg || 0).toFixed(0)}ms
  p(95) latency:       ${(data.metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(0)}ms
  p(99) latency:       ${(data.metrics.http_req_duration?.values?.['p(99)'] || 0).toFixed(0)}ms
  Feed p(95):          ${(data.metrics.feed_latency_ms?.values?.['p(95)'] || 0).toFixed(0)}ms
  Health p(95):        ${(data.metrics.health_latency_ms?.values?.['p(95)'] || 0).toFixed(0)}ms
  Checks passed:       ${data.metrics.checks?.values?.passes || 0}
  Checks failed:       ${data.metrics.checks?.values?.fails || 0}
══════════════════════════════════════════════════════════
`,
  };
}
