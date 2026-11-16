// Deep-diagnose the iframe empty-feed: capture /api/feed response BODIES,
// all console output, page errors, and unhandled rejections while walking
// the exact guest flow inside the cross-origin iframe.
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');

const PREVIEW = 'https://preview-chat-65819b41-e637-414a-bd70-012df0f4941f.space-z.ai/';
const HOST_URL = 'http://localhost:9999/host.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const feedResponses = [];
  page.on('response', async (res) => {
    if (res.url().includes('/api/feed')) {
      let body = null;
      try { body = await res.json(); } catch { /* html */ }
      feedResponses.push({
        t: Date.now() % 100000,
        status: res.status(),
        posts: body && body.posts ? body.posts.length : 'NO-BODY:' + (body === null ? 'non-json' : JSON.stringify(body).slice(0, 80)),
        firstId: body && body.posts && body.posts[0] ? body.posts[0].id : null,
      });
    }
  });

  const allLogs = [];
  const logFn = (label) => (m) => allLogs.push(`[${label}] ${m.type()}: ${m.text().slice(0, 180)}`);
  page.on('console', logFn('any-frame'));
  page.on('pageerror', (e) => allLogs.push(`[PAGEERROR] ${String(e).slice(0, 250)}`));
  ctx.on('weberror', (e) => allLogs.push(`[WEBERROR] ${String(e).slice(0, 250)}`));
  page.on('requestfailed', (r) => allLogs.push(`[REQFAIL] ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));

  await page.goto(HOST_URL, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);

  const frameEl = await page.waitForSelector('#preview');
  const frame = await frameEl.contentFrame();

  const skip = frame.getByText('Skip intro');
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(600); }
  const guest = frame.getByText('Continue as Guest');
  if (await guest.count()) { await guest.click(); }

  // Watch the feed area for 12 seconds, sampling DOM every 2s
  for (const t of [2, 4, 6, 8, 10, 12]) {
    await page.waitForTimeout(t === 2 ? 2000 : 2000);
    const state = await frame.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      const text = main.textContent || '';
      const hasSkeleton = text.includes('Loading') || document.querySelectorAll('[class*="animate-pulse"], [class*="skeleton"]').length > 0;
      const user4444 = (text.match(/User 4444/g) || []).length;
      const salary = text.includes('salary negotiation');
      const related = text.includes('Related Topics');
      const feedSetupFail = text.includes('Feed setup failed');
      return { user4444, salary, hasSkeleton, related, feedSetupFail };
    });
    console.log(`t+${t}s DOM:`, JSON.stringify(state));
  }

  console.log('\n--- /api/feed responses (in order) ---');
  feedResponses.forEach((r, i) => console.log(`${i}: t=${r.t} status=${r.status} posts=${r.posts} firstId=${r.firstId}`));

  console.log('\n--- console/pageerror/requestfailed (all) ---');
  allLogs.forEach((l) => console.log(l));

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
