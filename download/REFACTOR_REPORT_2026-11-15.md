# Refactor Report — Comment/Reactions Restore + Cleanup + Clone-Ready (2026-11-15)

Commit: `a3c08c5` on `feat/community-rebuild` (39 files, +1550/−403). All work on the existing codebase — no feature was dropped; no rewrite.

## 1. Confirmation checklist (the three unfinished items)

| Item | Status | Evidence |
|---|---|---|
| **Comment section restored** | ✅ DONE (was completed in `ec177a4` during the earlier session; I verified it live and fixed doc drift) | `feed/CommentThread.tsx`: threaded list, nesting + collapse at depth 3 ("Show N replies"), top-level composer + inline reply forms, confidential toggle, submit-guard, 5 sort modes, pin/edit/delete/restore, fossilized crown. Live Chromium test: comment posted, thread renders, count survives reload ("1 comments"). |
| **4-river system stays removed, zero functional leftovers** | ✅ DONE | grep-driven purge: `CommentStream` type, `STREAM_META` map (61 lines), `Comment.stream` field, `hive-river-pulse`/`hive-river-active` CSS, AuthContext intro copy, `index.html` og:description, hive-mind per-stream logic, legacy `reactions.love` reads. Remaining matches are prose comments explaining WHY the unified thread exists + false positives ("Alex Rivera", "network drivers"). |
| **Reactions restored (thumbs up/down, House/Mouth)** | ✅ DONE (verified at runtime) | Comment up/down votes: Reddit-style toggle semantics + net score + optimistic UI (`hooks/use-comments.ts voteComment`). House/Mouth: mutually exclusive reader classification (`voteClassification`), Landmark/Users icons with counts. Post reactions: server-persisted via `posts.ts` toggle endpoint (`lib/post-votes.ts`, unit-tested). **Persistence proven across reload**: IDB shows `{up:1, house:1, myHouse:true}` after page refresh; UI `aria-pressed` states verified. |

## 2. File-by-file changes

**Restore/cleanup of 4-river:**
- `lib/types.ts` — removed `Comment.stream`, `CommentStream`, `STREAM_META`; docs updated (per-post fossilization).
- `lib/hive-mind.ts` — fossilization now per-post top-3 (was per-stream, moot since streams are gone); fork check counts all roots (was debate-stream only); removed legacy `reactions?.love` vote fallbacks (edb715b parity); deleted a no-op "mark as forked" write that spread an object onto itself.
- `auth/AuthContext.tsx` — intro copy no longer advertises "4 rivers / Consensus Wiki"; thrown auth errors now carry `{ cause: error }` ×2.
- `index.html` — og:description updated (the plain description was fixed earlier; this sibling was missed).
- `index.css` — dead `hive-river-pulse` keyframes + `.hive-river-active` removed; `.hive-fossilized` kept (in use).
- `feed/CommentThread.tsx`, `feed/CommentThreadModal.tsx`, `hooks/use-comments.ts` — doc comments updated to match reality (stream no longer read anywhere; stale `activeStream` mention removed; modal description now says "upvote/downvote and House / Mouth votes").

**Dead code removed (ESLint-driven):**
- `pages/HomeFeed.tsx` — `SEED_POSTS` (44 unused lines; seeding uses `COLD_START_POSTS`).
- `pages/CommunityPage.tsx` — `CheckInCard` (83-line component with zero references) + `useSocial` import/destructure + 3 orphaned icons.
- `pages/MissionsPage.tsx`, `pages/SearchPage.tsx`, `BranchManagerSidebar.tsx`, `feed/LiveSessionBanner.tsx` — unused imports.
- `hooks/use-toast.ts` — dead `DEDUP_WINDOW_MS`, `actionTypes` const → literal union type (also removed a duplicate declaration the edit initially created).
- `lib/sw-cleanup.storage-blocked.test.ts`, `runtime/RealtimeSessionView.tsx`, `ImportModal.tsx` ×2, `pages/ProfilePage.tsx` — unused catch bindings (with intent comments where the swallow is deliberate).
- `public/font-loader.js`, `public/sw-killer.js` — `catch (_)` → optional catch binding.
- `pages/PersonalityTestPage.tsx` — unused `useAuth()` destructure.

**Correctness fixes surfaced by lint:**
- `server.ts` — `sentryErrorHandler()` was imported but never registered; now wired as the last express error middleware (no-op unless `SENTRY_DSN`).
- `lib/firebase-firestore.ts` — useless initializer + `null as unknown as T` double-cast removed; type contract (`T | null`, callers check null) preserved.
- `hooks/use-mission-reminders.ts` — useless `= null` initializer removed (both try/catch paths assign).
- 4 × `prefer-const` auto-fixed.

**Clone-ready / tooling:**
- `eslint.config.js` (NEW) — ESLint 9 flat config: js.recommended + typescript-eslint + react-hooks; public/*.js get browser globals; server files get node globals + console allowed; `no-empty` allows intentional best-effort catches; legacy patterns (set-state-in-effect, purity, manual-memoization) are warnings, not errors.
- `.prettierrc` (NEW) + `npm run format` / `format:check`.
- `package.json` — `lint` now runs `eslint . && npm run typecheck`; devDeps: eslint, @eslint/js, typescript-eslint, globals, eslint-plugin-react-hooks, prettier; lockfile updated and committed.
- `README.md` — added lint/format rows to the scripts table; corrected stale "223 tests" → 57.
- `.gitignore` / `.env.example` — already complete (verified: node_modules/dist/.env/OS junk; 34 server vars + 6 `VITE_*` with comments).

## 3. Verification

- `npm run lint` → ESLint **0 errors** (127 warnings, all catalogued) + tsc **0 errors**
- `npm test` → **57/57** passed (the sw-cleanup log-assertion test forced a revert of one cosmetic change — kept behavior identical)
- `npm run build` → 1.29 s, no warnings
- Chromium live run: post comment → votes register instantly (optimistic) → **reload → votes persisted** (`up:1, house:1, myHouse:true` in IndexedDB) → aria-pressed states correct.

## 4. Clone & run

```bash
git clone <repo-url> && cd MindSpool-latest-
npm ci
cp .env.example .env        # zero-config works in local-only mode
npm run dev                 # http://localhost:3000
# production:
npm run build && NODE_ENV=production npm start
# gates:
npm run lint && npm test && npm run typecheck
```

## 5. REMAINING ISSUES (not fixed — honest list)

1. **HIGH — offline action queue is write-only.** `lib/offline-sync.ts` only enqueues; nothing ever drains it. `use-social.ts` queues `create_post`/`post_reaction` on failure and they are never retried → unbounded growth. Fix: add a flush worker (online event + backoff, replay via existing `posts.ts` endpoints) and a queue-length indicator.
2. **HIGH — comments & comment votes are local-only (IndexedDB).** Posts sync to Supabase; comments/votes/House-Mouth do not (no server endpoint exists). Fine for the local-first single-viewer model ("persist votes correctly" holds per device, dedupe via `myVote`/`myHouseVote` + mutual exclusion), but multi-user threads won't share votes. Fix: `comments` table + `reactions(target_type='comment')` + REST routes mirroring `posts.ts`, queue the writes in the same offline-sync flush.
3. **MEDIUM — 127 ESLint warnings** (85 `no-explicit-any`, 20 `set-state-in-effect`, 14 `purity`, 9 exhaustive-deps). Errors are gated at 0; warnings need dedicated passes (typing IDB results, moving effect-driven state to derived state).
4. **MEDIUM — comment-count drift.** `commentCount` is a denormalized counter updated best-effort (B.4 comment in use-comments); during live testing a thread's count and contents diverged until refetch. Fix: recount on thread open or periodic reconciliation.
5. **LOW — Playwright e2e** (`tests/e2e/feed.spec.ts`, from the feed task) needs `npx playwright install` on a machine with browser binaries; excluded from vitest/tsc here.
6. **LOW — Prettier not mass-applied.** Config + scripts exist; running `npm run format` once would touch most files — deliberately deferred to avoid burying this diff.
7. **LOW — `rankComments` is exported but only used inside hive-mind** (kept exported for the fossilization API surface; unexport if you want stricter).
8. **LOW — reactivation notifications reuse `type: "mind_run"`** (pre-existing; a dedicated `hive_reactivation` type would need a UI change).
