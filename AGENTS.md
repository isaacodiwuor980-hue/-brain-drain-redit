# AGENTS.md

Rules for every agent working in this repository.

## Rule 1 — Complex tasks go through the arena skill

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

## Rule 2 — Maintain the PROGRESS.md checklist

Keep `PROGRESS.md` at the repository root as the single source of truth for
ongoing work:

1. Work on **one unchecked task at a time**.
2. **Test** the task before marking it done (run the relevant checks —
   e.g. `npm run typecheck`, `npm test`, `npm run build`, or a manual
   verification for non-code tasks).
3. **Check it off** (`- [ ]` → `- [x]`) only after it passes.
4. **Commit after every task** — one task, one commit that includes the
   completed work and the updated checklist entry.

## Rule 3 — 100% Completion & Zero-Shortcuts Policy

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
