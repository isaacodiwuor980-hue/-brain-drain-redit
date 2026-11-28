# AGENTS.md

Rules for every agent working in this repository. These rules are strict —
follow them in order, in every session, without exceptions.

## Rule 1 — Map the entire codebase before editing anything

Before you edit any file, first map the flow of the codebase and how all of
its pieces connect:

1. Identify the relevant entry points, components, pages, hooks, lib helpers,
   server/API code, and data stores involved in the task.
2. Trace the end-to-end flow (UI → hooks/lib → API/server → database → back
   to UI) and spell out how each piece connects to the others.
3. Use the skills library (see bottom of this file) — especially
   `acquire-codebase-knowledge`, `context-map`, `code-tour`, or `understand` —
   whenever the codebase area is large or unfamiliar.
4. Only after the map is clear may you edit files. If you cannot explain how
   the file you are about to change connects to the rest of the app, stop and
   map it first.

## Rule 2 — Build missing upstream features; do not patch symptoms

When something fails, find the root cause before touching the error site.
If the root cause is a **missing upstream feature** — for example, an image
post fails because no "create post" flow exists — do NOT patch the error
message, swallow the exception, or add a workaround. Instead, **build the
missing feature end-to-end** (UI, logic, API/server, storage, and tests), so
the original failure disappears because the feature now actually exists.

## Rule 3 — Break every problem into small, simple fragments

1. Split every task into the smallest independently verifiable fragments
   (one component, one function, one endpoint, one rule at a time).
2. Fix them one at a time, in order — never batch several fixes blindly.
3. Record the fragments in `PROGRESS.md` and check them off only as each one
   passes.

## Rule 4 — Test every piece; finish with zero bugs

1. After each fragment, run the relevant checks — `npm run typecheck`,
   `npm test`, `npm run build`, or a manual verification for non-code work.
2. Verify the fragment actually works in the running app before moving on.
3. Before declaring any task finished, re-check the entire change end-to-end.
   "Finished" means: zero type errors, zero failing tests, zero console
   errors, and the feature demonstrably works for the user.

## Rule 5 — Complex tasks go through the arena skill

Whenever asked to solve a complex task, design architecture, or use `/arena`:

1. Read `.skills/arena/SKILL.md` and follow its workflow exactly.
2. Run its multi-perspective debate, attack/defend, and rubric scoring
   workflow, using `.skills/arena/rubric.md` and
   `.skills/arena/strategies.json` for judging and strategy selection.
3. Write all intermediate notes (brackets, match logs, scores, drafts) to
   `.arena/` — it is git-ignored, so nothing in it gets committed.
4. **Sequential execution in this environment.** Because this environment
   runs in a single browser sandbox without a CLI sub-agent spawning tool,
   execute the Arena skill workflow (`.skills/arena/SKILL.md`,
   `strategies.json`, `rubric.md`) sequentially by writing each competing
   perspective, attack, defense, and judge score into `.arena/` markdown
   files rather than treating missing sub-agent spawning tools as a blocker.

## Rule 6 — Maintain the PROGRESS.md checklist

Keep `PROGRESS.md` at the repository root as the single source of truth for
ongoing work:

1. Work on **one unchecked task at a time**.
2. **Test** the task before marking it done (run the relevant checks —
   e.g. `npm run typecheck`, `npm test`, `npm run build`, or a manual
   verification for non-code tasks).
3. **Check it off** (`- [ ]` → `- [x]`) only after it passes.
4. **Commit after every task** — one task, one commit that includes the
   completed work and the updated checklist entry.

## Rule 7 — 100% Completion & Zero-Shortcuts Policy

1. **Break work down first.** When told to "work on X", first break X into
   complete, end-to-end subtasks in `PROGRESS.md` — covering UI, backend,
   edge cases, error handling, and tests.
2. **No shortcuts, no stubs.** Never leave `TODO`s, placeholders, mock data,
   or half-built features behind.
3. **Finish everything, sequentially.** Work through every unchecked item in
   `PROGRESS.md` one at a time — testing, fixing bugs, checking off the item,
   and committing after each step — until 100% of items are checked off and
   the app builds and passes all tests with zero errors.
4. **Done means done.** Do not claim "Done" until every item in `PROGRESS.md`
   is `[x]`, `git status` is clean, and all commits are pushed.

## Skills library

`.agents/skills/` and `.claude/skills/` hold identical copies of the shared
skills library. See `INDEX.md` inside either folder for the full list of 91
skills and their sources. Read a skill's `SKILL.md` before applying it.

Highest-value entries for this repo:

- **Codebase mapping (Rule 1):** `acquire-codebase-knowledge`, `context-map`,
  `code-tour`, `understand`, `understand-knowledge`, `codebase-design`
- **Root-cause work (Rule 2):** `diagnosing-bugs`, `systematic-debugging`,
  `debugging-and-error-recovery`, `bug-reproduction-brief`
- **Small fragments (Rule 3):** `tiny-stepping`, `breakdown-plan`,
  `incremental-implementation`, `planning-and-task-breakdown`
- **Testing before done (Rule 4):** `superpowers-test-driven-development`,
  `addyosmani-test-driven-development`, `tdd`, `verification-before-completion`,
  `webapp-testing`, `test-gap-audit`
- **Adversarial double-checking:** `proof-agent`, `grill-me`, `grilling`,
  `code-review`, `code-review-and-quality`
