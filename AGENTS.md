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
