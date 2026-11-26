/**
 * lib/data-quality-page.ts — SSR template for /data-quality.
 *
 * Public data quality dashboard. This is what AI labs look at before
 * licensing data from Brain Drain. Shows:
 *  - Total records, verified contributors, provenance chains
 *  - Confidence score distribution
 *  - Dispute resolution metrics
 *  - Data licensing summary
 *
 * The metrics are currently static (representing the platform's
 * architecture capabilities, not live counts). When the server-side
 * data store lands, these will be real queries.
 */
export interface DataQualityPageInput {
  origin?: string;
}

export function renderDataQualityPage(input: DataQualityPageInput): string {
  const { origin = "" } = input;
  const now = new Date().toISOString().slice(0, 10);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Data Quality Report · Brain Drain</title>
<meta name="description" content="Brain Drain data quality concepts and implementation status; live metrics are not available." />
<meta name="robots" content="index, follow" />
<link rel="canonical" href="${origin}/data-quality" />
<meta property="og:type" content="website" />
<meta property="og:title" content="Brain Drain — Data Quality Report" />
<meta property="og:description" content="Brain Drain data quality concepts and implementation status." />
<link rel="icon" href="/favicon.svg" />
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Brain Drain Data Quality Report",
  "description": "Data quality concepts and implementation status; not live verification metrics.",
  "url": `${origin}/data-quality`,
  "datePublished": now,
  "dateModified": now,
  "publisher": {
    "@type": "Organization",
    "name": "Brain Drain",
    "url": origin,
  },
  "isAccessibleForFree": true,
})}
</script>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
    max-width: 900px; margin: 2rem auto; padding: 0 1.25rem;
    line-height: 1.6; color: #1a1a1a; background: #fafafa;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0a0a0a; color: #e5e5e5; }
    .card { background: #141414; border-color: #262626 !important; }
    .stat { background: #141414; }
    .badge { background: #1d1d1d; }
  }
  header { border-bottom: 1px solid #e5e5e5; padding-bottom: 1rem; margin-bottom: 1.5rem; }
  header h1 { font-size: 1.6rem; margin: 0 0 0.4rem; }
  header .meta { font-size: 0.85rem; color: #666; }
  .card {
    background: white; border: 1px solid #e5e5e5; border-radius: 8px;
    padding: 1rem 1.25rem; margin: 1rem 0;
  }
  h2 { font-size: 1.1rem; margin: 0 0 0.75rem; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
  .stat {
    background: #f5f5f5; border-radius: 8px; padding: 1rem; text-align: center;
  }
  .stat .num { font-size: 1.8rem; font-weight: 700; line-height: 1; }
  .stat .label { font-size: 0.75rem; color: #666; margin-top: 0.3rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .badge {
    display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px;
    font-size: 0.75rem; font-weight: 600; margin: 0.1rem;
  }
  .badge.ok { background: #d1fae5; color: #065f46; }
  .badge.warn { background: #fef3c7; color: #92400e; }
  .badge.bad { background: #fee2e2; color: #991b1b; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th, td { padding: 0.5rem 0.4rem; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f5f5f5; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; }
  .bar { height: 8px; border-radius: 4px; background: #e5e5e5; overflow: hidden; }
  .bar-fill { height: 100%; background: #10b981; }
  footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e5e5e5; font-size: 0.8rem; color: #888; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: #f0f0f0; padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.85rem; }
</style>
</head>
<body>
<header>
  <h1>Data Quality Report</h1>
  <p class="meta">Brain Drain · last updated ${now} · <a href="${origin}/llms.txt">llms.txt</a> · <a href="${origin}/sitemap.xml">sitemap.xml</a></p>
</header>

<section class="card">
  <h2>Architecture capabilities</h2>
  <p>The following are design concepts, not verified platform-wide capabilities or live metrics. Implementation and deployment status vary.</p>
  <div class="stats">
    <div class="stat">
      <div class="num">SHA-256</div>
      <div class="label">Provenance chain</div>
    </div>
    <div class="stat">
      <div class="num">0-100</div>
      <div class="label">Confidence score</div>
    </div>
    <div class="stat">
      <div class="num">3 tiers</div>
      <div class="label">Verification (anon / identity / credential)</div>
    </div>
    <div class="stat">
      <div class="num">5 modes</div>
      <div class="label">Dispute workflow (file / respond / resolve / withdraw)</div>
    </div>
  </div>
</section>

<section class="card">
  <h2>Provenance integrity</h2>
  <p>A SHA-256 chain is a proposed provenance mechanism. Coverage across records, tamper detection, and deployment have not been verified.</p>
  <table>
    <thead>
      <tr><th>Record type</th><th>Hash algorithm</th><th>Chain structure</th><th>Verification</th></tr>
    </thead>
    <tbody>
      <tr><td>Drain entry</td><td>SHA-256</td><td>Per-record linked list</td><td><span class="badge warn">Pending /api/v1/provenance</span></td></tr>
      <tr><td>Post</td><td>SHA-256</td><td>Per-record linked list</td><td><span class="badge warn">Pending /api/v1/provenance</span></td></tr>
      <tr><td>Comment</td><td>SHA-256</td><td>Per-record linked list</td><td><span class="badge warn">Pending /api/v1/provenance</span></td></tr>
      <tr><td>Brain node</td><td>SHA-256</td><td>Per-record linked list</td><td><span class="badge warn">Pending /api/v1/provenance</span></td></tr>
      <tr><td>Brain will</td><td>SHA-256</td><td>Per-record linked list</td><td><span class="badge warn">Pending /api/v1/provenance</span></td></tr>
      <tr><td>Verification record</td><td>SHA-256</td><td>Per-record linked list</td><td><span class="badge warn">Pending /api/v1/provenance</span></td></tr>
    </tbody>
  </table>
</section>

<section class="card">
  <h2>Confidence score formula (transparent)</h2>
  <p>The following is a proposed formula, not evidence that every answer is scored or that scores verify accuracy:</p>
  <table>
    <thead>
      <tr><th>Component</th><th>Max points</th><th>How it's calculated</th></tr>
    </thead>
    <tbody>
      <tr><td>Confirmations</td><td>40</td><td>Each confirming answer weighted by the confirmer's verification tier (anon=2, identity=6, credential=10)</td></tr>
      <tr><td>Citations</td><td>20</td><td>4 points per citation URL, max 5 counted</td></tr>
      <tr><td>Reputation</td><td>20</td><td>3×3 matrix: answerer's verification tier × skill tier (anon beginner=0, credential expert=20)</td></tr>
      <tr><td>Disputes</td><td>-30</td><td>-5 per open dispute, -10 per upheld dispute</td></tr>
      <tr><td>Provenance</td><td>5</td><td>Flat bonus for an intact SHA-256 chain</td></tr>
    </tbody>
  </table>
</section>

<section class="card">
  <h2>Data licensing</h2>
  <p>These are proposed licensing categories. Per-record consent, access controls and any legacy arrangements have not been verified as implemented.</p>
  <div>
    <span class="badge ok">CC0 (public domain)</span>
    <span class="badge ok">CC-BY (attribution)</span>
    <span class="badge ok">CC-BY-SA (share-alike)</span>
    <span class="badge warn">CC-BY-NC (non-commercial)</span>
    <span class="badge bad">Proprietary (explicit grant only)</span>
  </div>
</section>

<section class="card">
  <h2>API access for AI labs</h2>
  <table>
    <thead>
      <tr><th>Endpoint</th><th>Method</th><th>Returns</th><th>Status</th></tr>
    </thead>
    <tbody>
      <tr><td><code>/api/v1/verify/:userId</code></td><td>GET</td><td>Verification record (JSON)</td><td><span class="badge warn">Pending implementation</span></td></tr>
      <tr><td><code>/api/v1/provenance/:recordId</code></td><td>GET</td><td>Provenance chain (JSON)</td><td><span class="badge warn">Pending implementation</span></td></tr>
      <tr><td><code>/api/v1/datasets</code></td><td>GET</td><td>Available datasets</td><td><span class="badge warn">Availability varies; not verified</span></td></tr>
      <tr><td><code>/api/v1/search?q=...</code></td><td>GET</td><td>Semantic search results</td><td><span class="badge warn">Contract published</span></td></tr>
      <tr><td><code>/api/v1/search/skills</code></td><td>GET</td><td>Skills search (rule + FTS)</td><td><span class="badge warn">Availability varies; not verified</span></td></tr>
    </tbody>
  </table>
</section>

<footer>
  <p>This page is server-rendered and crawlable. Programmatic access: <code>GET /api/healthz</code> for liveness.</p>
  <p>Brain Drain does not guarantee accuracy. Provenance, verification, and confidence information are not available for every record.</p>
</footer>
</body>
</html>`;
}
