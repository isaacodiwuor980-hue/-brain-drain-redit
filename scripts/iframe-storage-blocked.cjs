// Simulate Safari ITP / sandboxed-iframe storage blocking: make indexedDB
// throw inside the iframe, then walk the guest flow. This reproduces the
// "home feed empty in preview" failure mode deterministically.
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');

const HOST_URL = 'http://localhost:9999/host.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // Block storage access ONLY inside cross-origin iframes (Safari ITP behavior):
  // top-level pages get working storage; iframes get throwing indexedDB/localStorage.
  await ctx.addInitScript(() => {
    try {
      if (window.top === window.self) return; // top-level: keep storage
    } catch { /* cross-origin access to top throws → we ARE an iframe */ }
    const thrower = () => { throw new DOMException('Access to storage is not allowed from this context (simulated ITP)', 'SecurityError'); };
    Object.defineProperty(window, 'indexedDB', { get() { thrower(); }, configurable: true });
    const lsDesc = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { get() { thrower(); }, configurable: true });
  });

  const feedResponses = [];
  page.on('response', async (res) => {
    if (res.url().includes('/api/feed')) {
      let body = null;
      try { body = await res.json(); } catch {}
      feedResponses.push({ status: res.status(), posts: body && body.posts ? body.posts.length : 'non-json' });
    }
  });

  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 150)}`));
  page.on('pageerror', (e) => logs.push(`PAGEERROR: ${String(e).slice(0, 200)}`));

  await page.goto(HOST_URL, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);

  const frameEl = await page.waitForSelector('#preview');
  const frame = await frameEl.contentFrame();

  const skip = frame.getByText('Skip intro');
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(600); }
  const guest = frame.getByText('Continue as Guest');
  if (await guest.count()) { await guest.click(); }

  for (const t of [2, 4, 6, 8, 10, 12]) {
    await page.waitForTimeout(2000);
    const state = await frame.evaluate(() => {
      const text = (document.querySelector('main') || document.body).textContent || '';
      return {
        user4444: (text.match(/User 4444/g) || []).length,
        salary: text.includes('salary negotiation'),
        skeletons: document.querySelectorAll('[class*="animate-pulse"]').length,
        related: text.includes('Related Topics'),
        setupFail: text.includes('Feed setup failed'),
      };
    }).catch(e => 'EVAL-FAIL: ' + String(e).slice(0, 100));
    console.log(`t+${t}s DOM:`, JSON.stringify(state));
  }

  console.log('\n--- /api/feed responses ---');
  feedResponses.forEach((r, i) => console.log(`${i}: status=${r.status} posts=${r.posts}`));
  console.log('\n--- console (errors/warnings + pageerrors) ---');
  logs.filter(l => l.startsWith('error') || l.startsWith('warn') || l.startsWith('PAGEERROR')).slice(0, 20).forEach(l => console.log(l));

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
