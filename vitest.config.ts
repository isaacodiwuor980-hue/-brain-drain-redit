import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // The app resolves imports through the "@" alias (see tsconfig + vite.config).
  // The test runner needed the same mapping: ANY test that imported a real
  // component failed with "Cannot find package '@/components/ui/button'",
  // which is why the suite only ever covered pure lib/ helpers.
  resolve: {
    alias: {
      "@/components": path.resolve(import.meta.dirname),
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: false,
    // tests/e2e holds Playwright specs (run via `npx playwright test`,
    // requires browser binaries) — never picked up by the vitest unit run.
    exclude: ["**/node_modules/**", "tests/e2e/**"],
  },
});
