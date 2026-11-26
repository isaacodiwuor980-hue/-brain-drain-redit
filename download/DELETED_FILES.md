# DELETED_FILES.md — Permanently Removed (Phase 2)

Every item below was **proven unused** before deletion: BFS import-graph resolution from the entry chain (index.html → main.tsx → App.tsx), exact import-specifier greps (not substring matches), route/script/Dockerfile/CI reference tracing, and a full `typecheck + build + 35/35 tests + live preview` verification after removal. Git commits: `7856657` (feed fix reapply), `daa33db` (this cleanup).

## Directories (33 files)

| Path | Reason | Evidence |
|---|---|---|
| `mockup-sandbox/` (32 files) | Dead second Vite app (own package.json, port 3001, @replit plugins) | Only referenced by tsconfig **exclude** + a test's SKIP_DIRS; its watched source dir `src/components/mockups/` doesn't exist; never installed, never built, never deployed |
| `components/` (1 file) | Byte-identical duplicate of live `onboarding/OnboardingFlow.tsx` | Vite/tsconfig alias `@/components` → **repo root**, so App.tsx's `@/components/onboarding/OnboardingFlow` resolves to `onboarding/`; the `components/` copy has zero importers |

## Dead UI components (32 files — shadcn kit orphans)

`ui/accordion.tsx`, `ui/alert.tsx`, `ui/aspect-ratio.tsx`, `ui/breadcrumb.tsx`, `ui/button-group.tsx`, `ui/calendar.tsx`, `ui/carousel.tsx`, `ui/collapsible.tsx`, `ui/command.tsx`, `ui/context-menu.tsx`, `ui/drawer.tsx`, `ui/empty.tsx`, `ui/field.tsx`, `ui/form.tsx`, `ui/hover-card.tsx`, `ui/input-group.tsx`, `ui/input-otp.tsx`, `ui/item.tsx`, `ui/kbd.tsx`, `ui/menubar.tsx`, `ui/navigation-menu.tsx`, `ui/pagination.tsx`, `ui/popover.tsx`, `ui/radio-group.tsx`, `ui/resizable.tsx`, `ui/sidebar.tsx`, `ui/slider.tsx`, `ui/sonner.tsx`, `ui/spinner.tsx`, `ui/table.tsx`, `ui/toggle.tsx`, `ui/toggle-group.tsx`

**Evidence:** zero exact imports project-wide (verified `from "@/components/ui/<name>"` with closing quote — substring matches like `ui/alert` inside `ui/alert-dialog` were excluded as false positives). `ui/toggle` was imported only by dead `ui/toggle-group`; `ui/sidebar` was the sole importer of dead `hooks/use-mobile`.

## Dead hooks (4 files)

`hooks/use-api-health.ts`, `hooks/use-device-features.ts`, `hooks/use-gamification.ts`, `hooks/use-mobile.tsx` — zero importers (use-mobile only by dead ui/sidebar).

## Dead lib files (4 files)

`lib/firebase.ts` (superseded by firebase-app/-auth/-firestore; zero exact imports), `lib/smart-image.tsx`, `lib/puzzle-share.ts` + `lib/puzzle-share.test.ts` (imported only by its own test).

## Dead library tab components (2 files)

`library/MindDNA.tsx`, `library/ReadTab.tsx` — zero importers; `lib/types.ts` defines its own `MindDNA` interface (independent of the component); the smoke-test only asserts their absence.

## Backend (1 file)

`api-server/src/index.ts` — second standalone entry (own http server + shutdown handlers); referenced by no script, Dockerfile, or package.json.

## Root & script junk (13 files)

| File | Reason |
|---|---|
| `append_css.py`, `enhance_mobile_drawer.py`, `enhance_mobile_nav.py`, `update_comment.py`, `update_comment2.py`, `update_css.py`, `update_css_body.py`, `update_drawer_handle.py`, `update_modal.py` | One-off AI-assistant string/regex patch scripts; changes long applied; referenced by nothing |
| `bun.lock` | Stale duplicate lockfile — npm is canonical (CI, Dockerfile, README all use npm); missing 5 current deps |
| `screenshots.html` + `scripts/capture-screenshots.mjs` | Static mock gallery + screenshot script requiring playwright (not installed); referenced only by each other |
| `firebase-blueprint.json` | Unreferenced AI-tooling schema artifact |

## Unreferenced public/ assets (8 files)

`public/_redirects` (Netlify artifact — Express + firebase.json handle SPA fallback), `public/placeholder-logo.png`, `public/placeholder-logo.svg`, `public/placeholder-user.jpg`, `public/placeholder.jpg`, `public/placeholder.svg`, `public/icon-dark-32x32.png`, `public/icon-light-32x32.png` — zero references in index.html, manifest.webmanifest, sw.js, or any source file.

## Untracked from git (kept on disk)

| File | Reason |
|---|---|
| `.tsbuildinfo` | Regenerable build artifact; was noise on every typecheck (also deleted from disk) |
| `data/analytics-events.jsonl` | **Runtime** analytics data (1,283 lines of real session events) written by the server — kept on disk, removed from git, ignored via .gitignore |

## Dependencies removed / moved

| Change | Reason |
|---|---|
| `zod`: devDependencies → **dependencies** | **Bug fix**: 19 API route files import it; esbuild `--packages=external` + `npm prune --production` (Dockerfile) previously stripped it → production server would crash on `require("zod")` |
| Removed: `cookie-parser`, `@types/cookie-parser` | Zero imports anywhere |
| Removed: `drizzle-orm` | Zero imports; project uses Supabase REST |
| Removed: `firebase-admin`, `firebase-functions` | Only imported by `functions/` (own package.json — on the needs-decision list) |
| Removed 21 orphaned devDeps: `embla-carousel-react`, `react-day-picker`, `input-otp`, `sonner`, `vaul`, `react-resizable-panels`, `react-hook-form`, `next-themes`, `cmdk`, + 12 `@radix-ui/react-*` (accordion, aspect-ratio, collapsible, context-menu, hover-card, menubar, navigation-menu, popover, radio-group, slider, toggle, toggle-group) | Only imported by the 32 deleted ui/ files (verified against live code after deletion) |
| Moved to devDependencies: `firebase`, `recharts`, `@types/compression` | Vite-bundled frontend code / type-only imports — not needed by the production server runtime; `npm prune --production` now yields a lean image |

## Code/config changes (not deletions)

- `vite.config.ts`: removed dead `@assets` alias (pointed at non-existent `attached_assets/`)
- `tsconfig.json`: removed `mockup-sandbox` exclude (dir gone); added `functions` exclude (self-contained workspace with own package.json/tsconfig — its files broke root typecheck after their deps were removed from root)
- `.gitignore`: added `*.tsbuildinfo`, `.vite/`, `data/analytics-events*.jsonl`, `backups/`, `screenshots/`, `tool-results/`, `Thumbs.db`, `*.swp`
- `.env.example`: removed dead `APP_URL` (never read by any code); added `SUPABASE_ANALYTICS_TABLE` (read by config.ts, was undocumented) and the 7 `VITE_*` frontend build vars with the critical same-origin semantics documented
- `scripts/deploy.sh`: `bun run build` → `npm run build` (bun.lock removed; npm is canonical)
- `README.md`: fixed stale `scripts/start-server-persistent.sh` ref → `scripts/ensure-server.sh`

## Net effect

| Metric | Before | After |
|---|---|---|
| Git-tracked files | 332 | 246 (−86) |
| Runtime dependencies | 14 | 8 |
| devDependencies | 65 | 41 |
| Lockfile packages | — | 369 fewer after `npm prune --production` |
| One-off junk scripts | 9 .py + 2 others | 0 |
| Dead second apps | 2 (mockup-sandbox, components/ dupe) | 0 |

**Verification after all deletions:** `npm run typecheck` clean · `npm test` 35/35 pass · `npm run build` succeeds · live preview serves the feed end-to-end (fresh browser → onboarding → guest → posts render, `/api/feed` 200).
