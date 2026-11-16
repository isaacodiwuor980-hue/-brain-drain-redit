// Probe INSIDE the cross-origin iframe: storage + feed fetch + React Query state.
// Simulates the real z.ai preview environment (chat.z.ai iframes preview-*.space-z.ai).
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');

const PREVIEW_URL = 'https://preview-chat-65819b41-e637-414a-bd70-012df0f4941f.space-z.ai/';
const HOST_URL = 'http://localhost:9999/host.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();

  const logs = [];
  page.on('console', (m) => logs.push(`[top.${m.type()}] ${m.text().slice(0, 160)}`));

  await page.goto(HOST_URL, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(3000);

  // Get the preview iframe (cross-origin → use its own elementHandle + contentFrame)
  const frameEl = await page.waitForSelector('#preview', { timeout: 10000 });
  const frame = await frameEl.contentFrame();
  if (!frame) { console.log('FATAL: no contentFrame'); process.exit(1); }

  frame.on('console', (m) => logs.push(`[iframe.${m.type()}] ${m.text().slice(0, 160)}`));

  const probe = async (label, fn) => {
    try { console.log(label, await fn()); }
    catch (e) { console.log(label, 'THREW:', String(e).slice(0, 200)); }
  };

  // 1. Storage probes inside iframe (BEFORE interacting)
  await probe('IDB.open:', () => frame.evaluate(async () => {
    try {
      const dbs = await indexedDB.databases();
      return JSON.stringify({ ok: true, existing: dbs.map(d => d.name) });
    } catch (e) { return 'THROW: ' + e.name + ' ' + e.message; }
  }));

  await probe('IDB read/write test:', () => frame.evaluate(async () => {
    try {
      const req = indexedDB.open('__probe_test', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('t');
      const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
      const tx = db.transaction('t', 'readwrite');
      tx.objectStore('t').put('hello', 'k1');
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      const get = db.transaction('t', 'readonly').objectStore('t').get('k1');
      const val = await new Promise((res) => { get.onsuccess = () => res(get.result); get.onerror = () => res('ERR'); });
      db.close();
      indexedDB.deleteDatabase('__probe_test');
      return JSON.stringify({ ok: true, roundtrip: val });
    } catch (e) { return 'THROW: ' + e.name + ' ' + e.message; }
  }));

  await probe('localStorage:', () => frame.evaluate(() => {
    try {
      const keys = Object.keys(localStorage);
      return JSON.stringify({ ok: true, keyCount: keys.length, keys: keys.slice(0, 12) });
    } catch (e) { return 'THROW: ' + e.name + ' ' + e.message; }
  }));

  // 2. Feed fetch from inside iframe
  await probe('feed fetch:', () => frame.evaluate(async () => {
    try {
      const r = await fetch('/api/feed?mode=foryou&limit=30');
      const j = await r.json();
      return JSON.stringify({ status: r.status, posts: (j.posts || []).length, first: j.posts?.[0]?.content?.slice(0, 40), cache: r.headers.get('x-feed-cache') });
    } catch (e) { return 'THROW: ' + e.name + ' ' + e.message; }
  }));

  // 3. Walk the guest flow inside the iframe
  console.log('--- walking guest flow in iframe ---');
  const skip = frame.getByText('Skip intro');
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(800); }
  const guest = frame.getByText('Continue as Guest');
  if (await guest.count()) { await guest.click(); await page.waitForTimeout(5000); }

  await probe('post-flow localStorage:', () => frame.evaluate(() => {
    try {
      const keys = Object.keys(localStorage);
      const vals = {};
      for (const k of keys.slice(0, 15)) vals[k] = String(localStorage.getItem(k)).slice(0, 60);
      return JSON.stringify(vals);
    } catch (e) { return 'THROW: ' + e.name; }
  }));

  await probe('post-flow feed fetch:', () => frame.evaluate(async () => {
    try {
      const r = await fetch('/api/feed?mode=foryou&limit=30');
      const j = await r.json();
      return JSON.stringify({ status: r.status, posts: (j.posts || []).length, cache: r.headers.get('x-feed-cache') });
    } catch (e) { return 'THROW: ' + e.name; }
  }));

  // 4. Count post cards in DOM
  await probe('DOM post count:', () => frame.evaluate(() => {
    const arts = document.querySelectorAll('article');
    const texts = Array.from(document.querySelectorAll('main *')).filter(el => el.children.length === 0 && el.textContent && el.textContent.includes('salary negotiation')).length;
    return JSON.stringify({ articles: arts.length, salaryTextNodes: texts });
  }));

  console.log('--- iframe console (last 25) ---');
  logs.slice(-25).forEach(l => console.log(l));

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
