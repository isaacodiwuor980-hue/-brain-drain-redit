import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: false,
    // tests/e2e holds Playwright specs (run via `npx playwright test`,
    // requires browser binaries) — never picked up by the vitest unit run.
    exclude: ["**/node_modules/**", "tests/e2e/**"],
  },
});
