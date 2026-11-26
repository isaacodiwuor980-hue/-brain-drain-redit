// Synthetic two-tab test. Hardcoded local Vite fixture; never targets Supabase.
// Run with a locally installed Chromium: CHROMIUM_PATH=/path/to/chromium node scripts/test/privacy-browser.mjs
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error("Set CHROMIUM_PATH to a local Chromium executable");
const base = "http://127.0.0.1:4178";
const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const context = await browser.newContext();
  let posts = 0;
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === "/api/events") { posts++; return route.fulfill({ status:202, contentType:"application/json", body:'{"accepted":1,"storageMode":"memory"}' }); }
    return route.continue();
  });
  const first = await context.newPage(), second = await context.newPage();
  await Promise.all([first.goto(`${base}/scripts/test/privacy-browser.html`), second.goto(`${base}/scripts/test/privacy-browser.html`)]);
  await Promise.all([first.waitForFunction(() => !!window.privacyHarness), second.waitForFunction(() => !!window.privacyHarness)]);
  await first.evaluate(() => window.privacyHarness.clearLocalAnalytics());
  await first.evaluate(() => window.privacyHarness.setLocalAnalyticsEnabled(true));
  await second.evaluate(() => window.privacyHarness.trackEvent("topic_selected", {topicId:"synthetic"}));
  assert.equal((await second.evaluate(() => window.privacyHarness.getStored())).length, 1);
  const prior = await second.evaluate(() => window.privacyStorageNotifications);
  await first.evaluate(() => window.privacyHarness.setLocalAnalyticsEnabled(false));
  await second.waitForFunction(count => window.privacyStorageNotifications > count, prior);
  await second.evaluate(() => window.privacyHarness.trackEvent("topic_selected", {topicId:"synthetic-2"}));
  assert.deepEqual(await second.evaluate(() => window.privacyHarness.getAnalyticsEvents()), []);
  assert.equal((await second.evaluate(() => window.privacyHarness.getStored())).length, 1);
  await second.evaluate(() => window.privacyHarness.flushAnalyticsEvents());
  assert.equal(posts, 0, "queued events must not be sent after off");
  await first.evaluate(() => window.privacyHarness.setLocalAnalyticsEnabled(true));
  await second.evaluate(() => window.privacyHarness.trackEvent("topic_selected", {topicId:"synthetic-3"}));
  const beforeClear = await second.evaluate(() => window.privacyStorageNotifications);
  await first.evaluate(() => window.privacyHarness.clearLocalAnalytics());
  await second.waitForFunction(count => window.privacyStorageNotifications > count, beforeClear);
  assert.deepEqual(await second.evaluate(() => window.privacyHarness.getStored()), []);
  await second.evaluate(() => window.privacyHarness.flushAnalyticsEvents());
  assert.equal(posts, 0, "queued events must not be sent after clear");
  await context.close();
  console.log("PASS: real Chromium, two tabs; opt-out, cross-tab notification, local clear and pending queue suppression (synthetic data)");
} finally { await browser.close(); }
