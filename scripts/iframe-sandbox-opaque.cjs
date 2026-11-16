// Hardest-case iframe test: REAL sandbox="allow-scripts" (no allow-same-origin)
// => opaque origin => the BROWSER ITSELF blocks localStorage/IndexedDB/cookies.
// Unlike iframe-storage-blocked.cjs (simulated ITP via init-script override),
// this cannot be defeated by any app-side storage wrapper.
// Reuses the same flow as the committed diagnostics for comparability.
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');

const HOST_URL = 'http://localhost:9999/host-sandbox.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

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
  page.on('pageerror', (e) => logs.push(`PAGEERROR: ${String(e).slice(0, 250)}`));
  page.on('requestfailed', (r) => logs.push(`REQFAIL: ${r.url().slice(0, 110)} ${r.failure()?.errorText}`));

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
        offer: text.includes('international offer'),
        skeletons: document.querySelectorAll('[class*="animate-pulse"]').length,
        related: text.includes('Related Topics'),
        setupFail: text.includes('Feed setup failed'),
        errorScreen: /something went wrong|error boundary|crashed/i.test(text),
      };
    }).catch(e => 'EVAL-FAIL: ' + String(e).slice(0, 100));
    console.log(`t+${t}s DOM:`, JSON.stringify(state));
  }

  console.log('\n--- /api/feed responses ---');
  feedResponses.forEach((r, i) => console.log(`${i}: status=${r.status} posts=${r.posts}`));
  console.log('\n--- console errors/warnings/pageerrors ---');
  logs.filter(l => l.startsWith('error') || l.startsWith('warn') || l.startsWith('PAGEERROR') || l.startsWith('REQFAIL')).slice(0, 20).forEach(l => console.log(l));

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
