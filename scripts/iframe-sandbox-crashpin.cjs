// Variant of iframe-sandbox-opaque.cjs that captures the pageerror STACK
// and root-mount state, to pin the crash to an exact code site.
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');

const HOST_URL = 'http://localhost:9999/host-sandbox.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  page.on('pageerror', (e) => {
    console.log('PAGEERROR:', String(e).slice(0, 300));
    if (e.stack) console.log('STACK:', e.stack.split('\n').slice(0, 6).join(' | ').slice(0, 500));
  });

  await page.goto(HOST_URL, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(5000);

  const frameEl = await page.waitForSelector('#preview');
  const frame = await frameEl.contentFrame();

  const state = await frame.evaluate(() => ({
    rootChildren: (document.getElementById('root') || document.body).childElementCount,
    bodyTextLen: document.body.innerText.length,
    bodyHead: document.body.innerText.slice(0, 300).replace(/\n+/g, ' | '),
    feedReqs: performance.getEntriesByType('resource').filter(r => r.name.includes('/api/')).map(r => r.name.replace(location.origin, '')).slice(0, 10),
  })).catch(e => 'EVAL-FAIL: ' + String(e).slice(0, 150));
  console.log('FRAME STATE:', JSON.stringify(state, null, 1));

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
