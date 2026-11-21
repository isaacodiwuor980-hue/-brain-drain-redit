# Baseline verification (local only)

Exact captured output; git status had no output. No external database accessed.

## git branch --show-current
```
arena/7af7488e-brain-drain-redit
```

## git status --short
```
```

## git log --oneline -15
```
ecabcca Document identity inventory and provisioning design
20a6023 Use topic authority baseline for tier vote foundation
7d77118 Scope personality results to mapped identity
c39ccae Resolve topic follow identity to mapped UUID
4f86ca1 Record migration review and blocked release gates
bae5cff Repair migration syntax and test local chain
6f6a93d Document local safety work and release blockers
5851893 Add unwired tiered vote database foundation
357d6ec Add isolated weighted agreement calculation
77ef2d4 Clarify and test local settings data controls
8aba569 Reject conflicting topic creation
899661a Transport post tags and preserve feed reaction state
26a3597 Harden rate limits and personalized cache policy
6a305d9 Harden expert review and Firebase token checks
d8b04f7 Restrict skill search and owner mutations
```

## npm test
```

> @workspace/brain-builder@0.0.0 test
> vitest run --config vitest.config.ts


 RUN  v4.1.12 /home/user/-brain-drain-redit

 ✓ lib/migration-chain.integration.test.ts (2 tests) 15698ms
     ✓ applies each migration in order on a fresh database  8713ms
     ✓ re-applies the additive foundation migrations on the complete schema  6972ms
 ✓ lib/tsrg/set-reaction.integration.test.ts (4 tests) 5640ms
 ✓ lib/tsrg/p0.integration.test.ts (6 tests) 4616ms
 ✓ lib/tsrg/reaction-preview.integration.test.ts (6 tests) 4523ms
 ✓ lib/tsrg/schema.integration.test.ts (3 tests) 4739ms
 ✓ lib/tsrg/tiered-vote.integration.test.ts (11 tests) 4376ms
 ✓ api-server/src/routes/brains.atomic.test.ts (5 tests) 4083ms
 ✓ api-server/src/routes/post-tags.migration.test.ts (1 test) 2967ms
     ✓ preserves legacy posts and supports tag storage on repeated application  2965ms
 ✓ tests/settings-local-safety.test.tsx (4 tests) 248ms
 ✓ api-server/src/app.cache-safety.http.test.ts (3 tests) 243ms
 ✓ api-server/src/routes/experts.review.http.test.ts (5 tests) 173ms
 ✓ api-server/src/routes/skills.ownership.http.test.ts (9 tests) 135ms
 ✓ api-server/src/routes/brains.http.test.ts (3 tests) 117ms
 ✓ api-server/src/routes/brains.identity.http.test.ts (6 tests) 122ms
 ✓ lib/load-brain-data.test.ts (5 tests) 94ms
 ✓ api-server/src/routes/reactions.safety.test.ts (8 tests) 127ms
 ✓ api-server/src/lib/firebase-auth.email-verification.test.ts (13 tests) 106ms
 ✓ api-server/src/routes/personality.identity.http.test.ts (3 tests) 108ms
 ✓ api-server/src/routes/post-tags.http.test.ts (5 tests) 119ms
 ✓ api-server/src/routes/topics.identity.http.test.ts (4 tests) 92ms
 ✓ api-server/src/routes/topics.creation.http.test.ts (3 tests) 81ms
 ✓ api-server/src/routes/feed.reactions.http.test.ts (3 tests) 101ms
 ✓ api-server/src/routes/search.privacy.http.test.ts (4 tests) 81ms
 ✓ api-server/src/routes/me.http.test.ts (3 tests) 65ms
 ✓ tests/quick-decision.interaction.test.tsx (1 test) 58ms
 ✓ api-server/src/routes/tsrg-status.http.test.ts (4 tests) 75ms
 ✓ tests/render-smoke.test.tsx (5 tests) 57ms
 ✓ api-server/src/routes/data-api.claims.test.ts (1 test) 48ms
 ✓ lib/sw-cleanup.storage-blocked.test.ts (5 tests) 46ms
 ✓ tests/mobile-nav.interaction.test.tsx (1 test) 54ms
 ✓ lib/db.brain-transaction.test.ts (9 tests) 43ms
 ✓ lib/hook-order-guard.test.ts (1 test) 61ms
 ✓ hooks/use-tsrg-status.test.tsx (2 tests) 32ms
 ✓ api-server/src/lib/supabase.update-matching.test.ts (3 tests) 39ms
 ✓ lib/local-data-export.test.ts (3 tests) 36ms
DOMException [NotSupportedError]: Failed to load iframe page "https://evil/". Iframe page loading is disabled.
    at #loadPage (file:///home/user/-brain-drain-redit/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:334:27)
    at [connectedToDocument] (file:///home/user/-brain-drain-redit/node_modules/happy-dom/lib/nodes/html-iframe-element/HTMLIFrameElement.js:230:23)
    at [connectedToNode] (file:///home/user/-brain-drain-redit/node_modules/happy-dom/lib/nodes/node/Node.js:801:53)
    at [appendChild] (file:///home/user/-brain-drain-redit/node_modules/happy-dom/lib/nodes/node/Node.js:421:45)
    at [appendChild] (file:///home/user/-brain-drain-redit/node_modules/happy-dom/lib/nodes/element/Element.js:1102:62)
    at HTMLParser.parseEndOfStartTag (file:///home/user/-brain-drain-redit/node_modules/happy-dom/lib/html-parser/HTMLParser.js:489:53)
    at HTMLParser.parse (file:///home/user/-brain-drain-redit/node_modules/happy-dom/lib/html-parser/HTMLParser.js:213:34)
    at DOMParser.parseFromString (file:///home/user/-brain-drain-redit/node_modules/happy-dom/lib/dom-parser/DOMParser.js:27:68)
    at sanitizeHtml (/home/user/-brain-drain-redit/lib/sanitize-html.ts:123:31)
    at /home/user/-brain-drain-redit/lib/sanitize-html.test.ts:35:17
 ✓ lib/sanitize-html.test.ts (11 tests) 29ms
 ✓ lib/db.storage-blocked.test.ts (7 tests) 20ms
 ✓ lib/mission-stats.test.ts (9 tests) 19ms
 ✓ lib/api-client.test.ts (7 tests) 16ms
 ✓ tests/story-safe-text.test.tsx (1 test) 13ms
 ✓ tests/share-link.test.ts (12 tests) 14ms
 ✓ lib/reasoning-view.test.ts (16 tests) 11ms
 ✓ api-server/src/lib/rate-limit.test.ts (6 tests) 10ms
 ✓ lib/offline-sync.test.ts (11 tests) 11ms
 ✓ lib/tsrg/index.test.ts (7 tests) 9ms
 ✓ api-server/src/lib/rate-limit.atomic.test.ts (2 tests) 8ms
 ✓ lib/delete-brain.test.ts (4 tests) 11ms
 ✓ lib/sample-brains.test.ts (5 tests) 11ms
 ✓ api-server/src/middleware/p0-gates.test.ts (4 tests) 7ms
 ✓ lib/tsrg/v2.test.ts (5 tests) 8ms
 ✓ lib/offline-reconciliation.test.ts (4 tests) 6ms
 ✓ lib/api/brains.test.ts (3 tests) 7ms
 ✓ lib/recommendations.test.ts (6 tests) 7ms
 ✓ lib/tsrg/weighted-agreement.test.ts (5 tests) 6ms
 ✓ lib/brain-validator.test.ts (8 tests) 7ms
 ✓ lib/post-votes.test.ts (4 tests) 6ms
 ✓ lib/brains-sync.test.ts (4 tests) 6ms
 ✓ hooks/use-social.test.ts (10 tests) 6ms
 ✓ tests/navigation.test.ts (9 tests) 6ms
 ✓ lib/cloud-sync.test.ts (4 tests) 5ms
 ✓ lib/story-attachments.test.ts (2 tests) 5ms
 ✓ lib/api/feed.post-tags.test.ts (1 test) 4ms
 ✓ lib/admin-gate.test.ts (3 tests) 4ms
 ✓ lib/tsrg/claims-audit.test.ts (1 test) 4ms

 Test Files  64 passed (64)
      Tests  325 passed (325)
   Start at  10:00:50
   Duration  68.58s (transform 1.26s, setup 0ms, import 5.88s, tests 49.48s, environment 2.83s)


```

## npm run typecheck
```

> @workspace/brain-builder@0.0.0 typecheck
> tsc -p tsconfig.json --noEmit


```

## npm run build
```

> @workspace/brain-builder@0.0.0 build
> vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs

vite v8.3.6 building client environment for production...

 WARN  advancedChunks option is deprecated, please use codeSplitting instead.


 WARN  manualChunks option is ignored because the codeSplitting option is specified.

transforming...
✓ 3135 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                   6.15 kB │ gzip:   2.22 kB
dist/assets/index-BBJRLbnw.css                  177.02 kB │ gzip:  26.80 kB
dist/assets/check-ChETbyse.js                     0.12 kB │ gzip:   0.14 kB
dist/assets/chevron-down-Cw4U-qeh.js              0.12 kB │ gzip:   0.14 kB
dist/assets/chevron-up-BhXKLi_u.js                0.12 kB │ gzip:   0.14 kB
dist/assets/filter-DffdAgt2.js                    0.16 kB │ gzip:   0.16 kB
dist/assets/arrow-right-DRyW0L7e.js               0.16 kB │ gzip:   0.16 kB
dist/assets/code-CtP06awq.js                      0.18 kB │ gzip:   0.16 kB
dist/assets/rotate-ccw-BR7syLcb.js                0.19 kB │ gzip:   0.18 kB
dist/assets/activity-Ci4HGU4z.js                  0.23 kB │ gzip:   0.19 kB
dist/assets/globe-CKYrvVNY.js                     0.24 kB │ gzip:   0.18 kB
dist/assets/database-CSUnoLkQ.js                  0.24 kB │ gzip:   0.20 kB
dist/assets/heart-DSs6VJqg.js                     0.24 kB │ gzip:   0.21 kB
dist/assets/compass-BAmY1A25.js                   0.25 kB │ gzip:   0.20 kB
dist/assets/share-vc-L17bd.js                     0.25 kB │ gzip:   0.21 kB
dist/assets/calendar-F-UqUVVN.js                  0.25 kB │ gzip:   0.20 kB
dist/assets/monitor-tNMSYPUe.js                   0.25 kB │ gzip:   0.20 kB
dist/assets/triangle-alert-C0YYvmtA.js            0.26 kB │ gzip:   0.21 kB
dist/assets/image-WAjA_9gd.js                     0.26 kB │ gzip:   0.22 kB
dist/assets/shield-BhCYPjYw.js                    0.27 kB │ gzip:   0.22 kB
dist/assets/award-MA9geM-3.js                     0.27 kB │ gzip:   0.22 kB
dist/assets/book-open-Bc1XREJG.js                 0.27 kB │ gzip:   0.20 kB
dist/assets/smile-C4HqfOcr.js                     0.29 kB │ gzip:   0.21 kB
dist/assets/file-code-2-BOBzsGGU.js               0.29 kB │ gzip:   0.21 kB
dist/assets/square-pen-BFZvuB8k.js                0.31 kB │ gzip:   0.23 kB
dist/assets/refresh-cw-DT5WT1aZ.js                0.32 kB │ gzip:   0.22 kB
dist/assets/git-fork-y1IPkOmH.js                  0.32 kB │ gzip:   0.23 kB
dist/assets/file-text-DyhOQJ14.js                 0.33 kB │ gzip:   0.21 kB
dist/assets/share-2-DLudcIY9.js                   0.35 kB │ gzip:   0.23 kB
dist/assets/zap-CJtXyMKo.js                       0.35 kB │ gzip:   0.25 kB
dist/assets/clsx-DB0hHKMi.js                      0.36 kB │ gzip:   0.23 kB
dist/assets/firebase-auth-BfiuNblg.js             0.38 kB │ gzip:   0.25 kB
dist/assets/network-4KDElHcp.js                   0.38 kB │ gzip:   0.23 kB
dist/assets/download-CM-2ychq.js                  0.39 kB │ gzip:   0.27 kB
dist/assets/related-BBgnNi7f.js                   0.40 kB │ gzip:   0.27 kB
dist/assets/firebase-firestore-DJMVMI0Q.js        0.40 kB │ gzip:   0.26 kB
dist/assets/star-IQCdhNqB.js                      0.47 kB │ gzip:   0.29 kB
dist/assets/firebase-app-CudnvW5f.js              0.48 kB │ gzip:   0.34 kB
dist/assets/bell-off-dcn_lOHc.js                  0.50 kB │ gzip:   0.33 kB
dist/assets/progress-_DMnr0_x.js                  0.54 kB │ gzip:   0.36 kB
dist/assets/unsaved-changes-dialog-E2qcWQ1n.js    0.74 kB │ gzip:   0.42 kB
dist/assets/trash-2-DBbDX5ZH.js                   0.75 kB │ gzip:   0.44 kB
dist/assets/avatar-BPBxYV1W.js                    0.75 kB │ gzip:   0.37 kB
dist/assets/checkbox-8h9RI82Q.js                  0.79 kB │ gzip:   0.44 kB
dist/assets/brain-circuit-XWbPsY6T.js             0.79 kB │ gzip:   0.40 kB
dist/assets/badge-CHGQwXFt.js                     0.86 kB │ gzip:   0.46 kB
dist/assets/community-BtkpTD62.js                 0.86 kB │ gzip:   0.46 kB
dist/assets/skeleton-CnLvrEAU.js                  0.86 kB │ gzip:   0.50 kB
dist/assets/rolldown-runtime-BWaJ3C7D.js          0.91 kB │ gzip:   0.51 kB
dist/assets/switch-BanA-Oa-.js                    0.92 kB │ gzip:   0.49 kB
dist/assets/scroll-area-kFkVJ9ec.js               0.93 kB │ gzip:   0.48 kB
dist/assets/createLucideIcon-Sh22PFrp.js          0.95 kB │ gzip:   0.56 kB
dist/assets/env-DnZAogSM.js                       0.98 kB │ gzip:   0.56 kB
dist/assets/use-profile-BpAAI2ui.js               1.13 kB │ gzip:   0.62 kB
dist/assets/use-stories-Dp631I6g.js               1.33 kB │ gzip:   0.65 kB
dist/assets/tabs-DJJXQSMC.js                      1.43 kB │ gzip:   0.61 kB
dist/assets/share-link-DzCIaOvK.js                1.48 kB │ gzip:   0.67 kB
dist/assets/use-discover-C4LSwEIO.js              1.59 kB │ gzip:   0.74 kB
dist/assets/preload-helper-7y9sWmk5.js            1.61 kB │ gzip:   0.82 kB
dist/assets/use-toast-FVC4-Nqz.js                 1.91 kB │ gzip:   0.93 kB
dist/assets/button-Dr9Aymkg.js                    1.99 kB │ gzip:   0.99 kB
dist/assets/use-topics-2uxYFnUd.js                2.08 kB │ gzip:   0.91 kB
dist/assets/alert-dialog-BDnlLURU.js              2.19 kB │ gzip:   0.80 kB
dist/assets/use-messages-Bahnc7Tc.js              2.32 kB │ gzip:   0.98 kB
dist/assets/sheet-BgTvNhTG.js                     2.42 kB │ gzip:   0.96 kB
dist/assets/use-reputation-CgIoKemm.js            2.45 kB │ gzip:   1.05 kB
dist/assets/confetti-D67nFOHI.js                  2.61 kB │ gzip:   1.19 kB
dist/assets/AnimatePresence-BlwOpTKS.js           3.06 kB │ gzip:   1.45 kB
dist/assets/MobileNavDrawer-DPpX0rkH.js           3.35 kB │ gzip:   1.53 kB
dist/assets/select-BBDwaJ3g.js                    3.37 kB │ gzip:   1.23 kB
dist/assets/use-missions-DE5KhMCo.js              3.97 kB │ gzip:   1.29 kB
dist/assets/wouter-BFWcqnvo.js                    4.13 kB │ gzip:   2.07 kB
dist/assets/use-habits-CoQsL0Ui.js                4.93 kB │ gzip:   1.85 kB
dist/assets/use-database-Dxi05rRl.js              5.00 kB │ gzip:   2.17 kB
dist/assets/command-palette-DCLU3p8k.js           5.06 kB │ gzip:   2.27 kB
dist/assets/use-skills-e847PxN4.js                5.17 kB │ gzip:   2.03 kB
dist/assets/NotificationsPage-CoyHPDFJ.js         5.74 kB │ gzip:   2.27 kB
dist/assets/TopicsPage-BnLURxF9.js                5.86 kB │ gzip:   2.07 kB
dist/assets/ShareBrainModal-xj-ytzAj.js           5.93 kB │ gzip:   2.28 kB
dist/assets/TopicDetailPage-C4kjTic4.js           6.41 kB │ gzip:   2.24 kB
dist/assets/sample-brains-C81TlG69.js             7.52 kB │ gzip:   2.65 kB
dist/assets/use-social-DOA6SChQ.js                7.84 kB │ gzip:   3.33 kB
dist/assets/OnboardingFlow-CGgtxJoB.js           10.11 kB │ gzip:   3.26 kB
dist/assets/PersonalityTestPage-CZ73ikCu.js      10.32 kB │ gzip:   3.39 kB
dist/assets/view-error-boundary-0Yy2_lqB.js      10.70 kB │ gzip:   4.12 kB
dist/assets/BrainChatRuntime-CDKD5aFK.js         11.22 kB │ gzip:   3.66 kB
dist/assets/MessagesPage-CLaBnZ3C.js             12.05 kB │ gzip:   4.18 kB
dist/assets/db-BPfdc1_j.js                       14.51 kB │ gzip:   3.02 kB
dist/assets/RuntimeEngine-GUbDt0WH.js            15.29 kB │ gzip:   5.12 kB
dist/assets/utils-CIJt2r-J.js                    19.73 kB │ gzip:   6.74 kB
dist/assets/StoriesBar-DnEXAv6H.js               19.87 kB │ gzip:   6.62 kB
dist/assets/SettingsPage-BRW3ih6M.js             20.33 kB │ gzip:   6.31 kB
dist/assets/date-fns-BHdATOLx.js                 21.44 kB │ gzip:   6.15 kB
dist/assets/SearchPage-DwNlRzyS.js               23.89 kB │ gzip:   5.29 kB
dist/assets/WizardModal-DYHkNLz7.js              32.98 kB │ gzip:   9.58 kB
dist/assets/tanstack-Dbxy4-GF.js                 39.70 kB │ gzip:  11.36 kB
dist/assets/MissionsPage-r2Qo6-IW.js             40.11 kB │ gzip:   9.34 kB
dist/assets/PostCreator-GcPBIOR4.js              42.59 kB │ gzip:  10.28 kB
dist/assets/radix-lazy-DIHQjzr8.js               45.87 kB │ gzip:  13.38 kB
dist/assets/LibraryPage-5vE245KN.js              49.57 kB │ gzip:  13.02 kB
dist/assets/CommunityPage-BRPOkZsh.js            55.12 kB │ gzip:  12.92 kB
dist/assets/ProfilePage-LvJcgZsB.js              58.49 kB │ gzip:  14.13 kB
dist/assets/PostCard-HDdYSUd5.js                 59.82 kB │ gzip:  15.58 kB
dist/assets/BrainDrawer-CxLRQ1c9.js              64.37 kB │ gzip:  15.38 kB
dist/assets/HomeFeed-CymKER7V.js                103.67 kB │ gzip:  29.09 kB
dist/assets/index-CyW8sE3L.js                   105.59 kB │ gzip:  32.52 kB
dist/assets/proxy-BJlOujCA.js                   109.91 kB │ gzip:  36.26 kB
dist/assets/radix-shell-DCJo4aZm.js             113.26 kB │ gzip:  36.01 kB
dist/assets/firebase-auth-DBkMVCG1.js           127.65 kB │ gzip:  36.34 kB
dist/assets/react-vendor-BoNAakIc.js            219.64 kB │ gzip:  68.57 kB
dist/assets/es6-BAiKKZ5x.js                     378.66 kB │ gzip: 100.16 kB
dist/assets/firebase-firestore-DLeJwpfG.js      589.46 kB │ gzip: 174.15 kB

✓ built in 5.20s

  dist/server.cjs      144.1kb
  dist/server.cjs.map  313.2kb

⚡ Done in 44ms

```

## npx eslint .
```

/home/user/-brain-drain-redit/Dashboard.tsx
  88:7  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/-brain-drain-redit/Dashboard.tsx:88:7
  86 |     window.history.replaceState({}, "", window.location.pathname);
  87 |     if (match) {
> 88 |       setSelectedBrain(match);
     |       ^^^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  89 |       setIsDrawerOpen(true);
  90 |     } else {
  91 |       toast({  react-hooks/set-state-in-effect

/home/user/-brain-drain-redit/pages/SearchPage.tsx
  62:23  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/-brain-drain-redit/pages/SearchPage.tsx:62:23
  60 |     try {
  61 |       const q = new URLSearchParams(search).get("q");
> 62 |       if (q !== null) setQuery(q);
     |                       ^^^^^^^^ Avoid calling setState() directly within an effect
  63 |     } catch {
  64 |       /* malformed URL — keep the current query */
  65 |     }  react-hooks/set-state-in-effect

✖ 2 problems (0 errors, 2 warnings)


```

## npm audit
```
# npm audit report

minimatch  7.0.0 - 11.0.0
Severity: moderate
minimatch has potential denial of service via globparts amplification - https://github.com/advisories/GHSA-g3hv-75wg-m249
fix available via `npm audit fix`
node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch
  @typescript-eslint/typescript-estree  6.16.0 - 8.72.2
  Depends on vulnerable versions of minimatch
  node_modules/@typescript-eslint/typescript-estree
    @typescript-eslint/parser  6.16.0 - 8.72.2
    Depends on vulnerable versions of @typescript-eslint/typescript-estree
    node_modules/@typescript-eslint/parser
      typescript-eslint  <=8.72.2
      Depends on vulnerable versions of @typescript-eslint/eslint-plugin
      Depends on vulnerable versions of @typescript-eslint/parser
      Depends on vulnerable versions of @typescript-eslint/typescript-estree
      Depends on vulnerable versions of @typescript-eslint/utils
      node_modules/typescript-eslint
    @typescript-eslint/type-utils  6.16.0 - 8.72.2
    Depends on vulnerable versions of @typescript-eslint/typescript-estree
    Depends on vulnerable versions of @typescript-eslint/utils
    node_modules/@typescript-eslint/type-utils
      @typescript-eslint/eslint-plugin  6.16.0 - 8.72.2
      Depends on vulnerable versions of @typescript-eslint/type-utils
      Depends on vulnerable versions of @typescript-eslint/utils
      node_modules/@typescript-eslint/eslint-plugin
    @typescript-eslint/utils  6.16.0 - 8.72.2
    Depends on vulnerable versions of @typescript-eslint/typescript-estree
    node_modules/@typescript-eslint/utils

postcss-selector-parser  <6.1.5
Severity: moderate
PostCSS: Quadratic complexity in flat selector parsing allows CPU exhaustion - https://github.com/advisories/GHSA-rj75-hqrm-r3gf
fix available via `npm audit fix --force`
Will install @tailwindcss/typography@0.5.4, which is a breaking change
node_modules/postcss-selector-parser
  @tailwindcss/typography  <=0.0.0-insiders.fda8ce5 || >=0.5.5
  Depends on vulnerable versions of postcss-selector-parser
  node_modules/@tailwindcss/typography

9 moderate severity vulnerabilities

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

```

