// ESLint flat config. Scope: correctness rules only (hooks, TS hygiene) —
// style is delegated to Prettier (.prettierrc), not ESLint.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "build/**",
      "node_modules/**",
      "coverage/**",
      "logs/**",
      "scripts/**",
      "tests/e2e/**", // Playwright specs — run by `npx playwright test`
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The codebase intentionally uses `!` and `any` in a few isolated
      // spots (IDB guards, legacy casts). Non-null assertions stay; `any`
      // is capped at warn so new code leans typed without failing CI.
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      // Legacy patterns that need a dedicated pass — surfaced as warnings
      // so NEW code doesn't add to them without at least silencing the
      // warning deliberately.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // Best-effort try/catch blocks intentionally swallow storage/IDB
      // errors — an empty catch with no comment is fine there.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // Server + config files run in Node. Server bootstrap logging
    // (console.log on start/shutdown) is deliberate — pino isn't up yet.
    files: ["server.ts", "api-server/**/*.ts", "vitest.config.ts", "vite.config.ts"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "no-console": "off",
    },
  },
  {
    // Plain browser scripts served from /public (font loader, sw-killer).
    files: ["public/**/*.js"],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // sw-cleanup logs before the app logger exists; its test replicates that
    // exact behavior (and asserts the log line) — keep console.log there.
    files: ["lib/sw-cleanup.ts", "lib/sw-cleanup.storage-blocked.test.ts"],
    rules: {
      "no-console": "off",
    },
  },
);
