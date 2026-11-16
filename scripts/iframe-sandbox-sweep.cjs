// Sweep across EVERY plausible iframe sandbox configuration a host like
// chat.z.ai might use, served from a real localhost origin (data: URLs cannot
// reliably embed cross-origin iframes). Verifies the deployed Brain Drain
// preview renders posts in each sandbox configuration.
//
// We do NOT claim any of these exactly matches chat.z.ai — that requires
// chat.z.ai credentials we do not have. We DO claim the fix survives the
// full plausible sandbox space.
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');
const http = require('http');

const PREVIEW = 'https://preview-chat-65819b41-e637-414a-bd70-012df0f4941f.space-z.ai/';

const CASES = [
  { label: 'no-sandbox-attr', sandbox: '' },
  { label: 'allow-scripts', sandbox: 'allow-scripts' },
  { label: 'allow-scripts allow-forms', sandbox: 'allow-scripts allow-forms' },
  { label: 'allow-scripts allow-popups', sandbox: 'allow-scripts allow-popups' },
  { label: 'allow-scripts allow-same-origin', sandbox: 'allow-scripts allow-same-origin' },
  { label: 'allow-scripts allow-forms allow-popups allow-same-origin', sandbox: 'allow-scripts allow-forms allow-popups allow-same-origin' },
  { label: 'allow-scripts allow-forms allow-popups', sandbox: 'allow-scripts allow-forms allow-popups' },
  { label: 'allow-scripts allow-downloads', sandbox: 'allow-scripts allow-downloads' },
  { label: 'allow-scripts allow-downloads allow-forms allow-popups', sandbox: 'allow-scripts allow-downloads allow-forms allow-popups' },
];

function makeHostHtml(sandbox) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;background:#222}iframe{width:100%;height:100vh;border:0}</style></head>
<body><iframe id="preview" ${sandbox ? `sandbox="${sandbox}"` : ''} src="${PREVIEW}"></iframe></body></html>`;
}

// Tiny HTTP server that serves the requested sandbox variant on demand via ?case=
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost:9998');
      const label = url.searchParams.get('case') || 'default';
      const c = CASES.find(x => x.label === label) || CASES[0];
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(makeHostHtml(c.sandbox));
    });
    server.listen(9998, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const results = [];

  for (const c of CASES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    const pageerrors = [];
    const feedReqs = [];
    page.on('pageerror', (e) => pageerrors.push(String(e).slice(0, 180)));
    page.on('response', async (res) => {
      if (res.url().includes('/api/feed')) {
        let posts = 'non-json';
        try { const j = await res.json(); posts = (j.posts || []).length; } catch {}
        feedReqs.push({ status: res.status(), posts });
      }
    });

    try {
      await page.goto(`http://localhost:9998/?case=${encodeURIComponent(c.label)}`, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
      results.push({ ...c, error: 'goto: ' + String(e).slice(0, 80) });
      await ctx.close();
      continue;
    }
    await page.waitForTimeout(2500);

    const frameEl = await page.waitForSelector('#preview', { timeout: 5000 }).catch(() => null);
    if (!frameEl) { results.push({ ...c, error: 'no iframe element' }); await ctx.close(); continue; }
    const frame = await frameEl.contentFrame();
    if (!frame) { results.push({ ...c, error: 'no contentFrame (cross-origin blocked)' }); await ctx.close(); continue; }

    try {
      const skip = frame.getByText('Skip intro', { exact: true });
      if (await skip.count()) { await skip.click(); await page.waitForTimeout(800); }
      const guest = frame.getByText('Continue as Guest', { exact: true });
      if (await guest.count()) { await guest.click(); }
    } catch (e) {
      results.push({ ...c, error: 'flow: ' + String(e).slice(0, 80) });
      await ctx.close();
      continue;
    }

    await page.waitForTimeout(8000);
    let state = { error: 'eval-failed' };
    try {
      state = await frame.evaluate(() => {
        const t = (document.querySelector('main') || document.body).textContent || '';
        return {
          salary: t.includes('salary negotiation'),
          offer: t.includes('international offer'),
          user4444: (t.match(/User 4444/g) || []).length,
          errorScreen: /something went wrong|error boundary|crashed/i.test(t),
        };
      });
    } catch (e) {
      state = { error: 'eval: ' + String(e).slice(0, 80) };
    }

    results.push({
      label: c.label,
      sandbox: c.sandbox || '(none)',
      pageerrors: pageerrors.length,
      firstError: pageerrors[0]?.slice(0, 100) || null,
      feedReqs: feedReqs.length,
      feedStatus: feedReqs[0]?.status || null,
      feedPosts: feedReqs[0]?.posts || null,
      salary: state.salary,
      offer: state.offer,
      user4444: state.user4444,
      errorScreen: state.errorScreen,
      evalError: state.error || null,
    });

    await ctx.close();
  }

  await browser.close();
  server.close();

  console.log('\n========== SANDBOX SWEEP RESULTS ==========');
  console.log('label | sandbox | pageerrors | feed(reqs/status/posts) | render(salary/offer/user4444) | errorScreen');
  for (const r of results) {
    if (r.error) {
      console.log(`${r.label} | ${r.sandbox||'(none)'} | ERROR: ${r.error}`);
      continue;
    }
    const pass = r.salary && r.offer && r.user4444 === 2 && r.pageerrors === 0 && !r.errorScreen ? 'PASS' : 'FAIL';
    console.log(`[${pass}] ${r.label} | ${r.sandbox} | errs=${r.pageerrors} | feed=${r.feedReqs}/${r.feedStatus}/${r.feedPosts} | render=${r.salary}/${r.offer}/${r.user4444} | errScreen=${r.errorScreen}`);
    if (r.firstError) console.log(`   firstError: ${r.firstError}`);
    if (r.evalError) console.log(`   evalError: ${r.evalError}`);
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
