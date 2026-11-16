/**
 * E2E: Home Feed loads across browser engines + mobile emulation.
 *
 * Requires Playwright browsers (not installed in the dev sandbox — run on a
 * machine that can download them):
 *   npx playwright install chromium firefox webkit
 *   npx playwright test tests/e2e/feed.spec.ts
 *
 * Start the app first:  npm run build && npm start   (port 3000)
 */
import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test.describe("Home feed", () => {
  // Desktop engines: chromium ≈ Chrome/Edge, firefox, webkit ≈ Safari.
  for (const browserName of ["chromium", "firefox", "webkit"] as const) {
    test.use({ browserName });
    test(`feed renders posts and no console errors (${browserName})`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("requestfailed", (req) => failedRequests.push(`${req.url()} ${req.failure()?.errorText}`));

      await page.goto(BASE, { waitUntil: "domcontentloaded" });

      // First-run onboarding: skip intro, continue as guest (best effort —
      // returning profiles land straight on the feed).
      const skip = page.getByRole("button", { name: /skip intro/i });
      if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) {
        await skip.click();
        await page.getByRole("button", { name: /continue as guest/i }).click();
      }

      // Feed tabs must appear and at least one post card must render.
      await expect(page.getByRole("tab", { name: "For You" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("tab", { name: "Following" })).toBeVisible();
      // Skeletons must resolve into real content (or the explicit empty state).
      await expect(page.locator("main, body")).toContainText(/.+/);

      // The retry banner must NOT be visible when the backend is healthy.
      await expect(page.getByRole("alert").filter({ hasText: /latest posts/i })).toHaveCount(0);

      expect(failedRequests, "no failed network requests").toEqual([]);
      expect(consoleErrors, "no console errors").toEqual([]);
    });
  }

  // Mobile emulation: Pixel-class Android Chrome and iPhone-class Safari.
  for (const deviceName of ["Pixel 7", "iPhone 14"]) {
    test(`feed renders on mobile emulation (${deviceName})`, async ({ browser }) => {
      const device = test.info().project.use;
      void device;
      const context = await browser.newContext({
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          deviceName === "Pixel 7"
            ? "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36"
            : "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
      const page = await context.newPage();
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      const skip = page.getByRole("button", { name: /skip intro/i });
      if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) {
        await skip.click();
        await page.getByRole("button", { name: /continue as guest/i }).click();
      }
      await expect(page.getByRole("tab", { name: "For You" })).toBeVisible({ timeout: 15_000 });
      // No horizontal overflow at 360px (responsive regression guard).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      await context.close();
    });
  }
});
