# Agent Skills Library

Identical copies of this library live in `.agents/skills/` and `.claude/skills/`.
Each folder is one skill — read its `SKILL.md` before applying it.

Curated and installed from these open-source collections:

| Source | Contents |
| --- | --- |
| [mattpocock/skills](https://github.com/mattpocock/skills) | Engineering workflow skills (`grill-me`, `grilling`, `diagnosing-bugs`, `tdd`, `implement`, `code-review`, `codebase-design`, `wayfinder`, …) |
| [obra/superpowers](https://github.com/obra/superpowers) | Full process discipline (`test-driven-development` → `superpowers-test-driven-development`, `systematic-debugging`, `verification-before-completion`, `writing-plans`, …) |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | All 26 skills (`test-driven-development` → `addyosmani-test-driven-development`, `debugging-and-error-recovery`, `code-review-and-quality`, `planning-and-task-breakdown`, …) |
| [Egonex-AI/Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) | All 9 `understand-*` codebase-mapping skills |
| [AndreaGriffiths11/proof-agent](https://github.com/AndreaGriffiths11/proof-agent) | Adversarial verification skill + its scripts |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | Curated subset only (400+ skills total upstream — installing all would flood skill discovery): `acquire-codebase-knowledge`, `context-map`, `code-tour`, `breakdown-plan`, `create-implementation-plan`, `bug-reproduction-brief`, `test-gap-audit`, `tiny-stepping`, `webapp-testing` |

## Index

| Skill | Source | Description |
| --- | --- | --- |
| `accessibility-engineering` | addyosmani/agent-skills | Audits existing interfaces for WCAG 2.2 AA conformance and remediates the violations found. Use when auditing a page or component for accessibility, r |
| `acquire-codebase-knowledge` | github/awesome-copilot (curated) | 'Use this skill when the user explicitly asks to map, document, or onboard into an existing codebase. Trigger for prompts like "map this codebase", "d |
| `addyosmani-test-driven-development` | addyosmani/agent-skills | Drives development with tests using the red-green-refactor loop. Use when implementing any logic, fixing any bug, or changing any behavior. Use when y |
| `api-and-interface-design` | addyosmani/agent-skills | Guides stable API and interface design. Use when designing APIs, module boundaries, or any public interface. Use when creating REST or GraphQL endpoin |
| `ask-matt` | mattpocock/skills | Ask which skill or flow fits your situation. A router over the skills in this repo. |
| `brainstorming` | obra/superpowers | "You MUST use this before any creative work - creating features, building components, adding functionality, modifying behavior, or planning anything n |
| `breakdown-plan` | github/awesome-copilot (curated) | 'Issue Planning and Automation prompt that generates comprehensive project plans with Epic > Feature > Story/Enabler > Test hierarchy, dependencies, p |
| `browser-testing-with-devtools` | addyosmani/agent-skills | Tests in real browsers via Chrome DevTools MCP. Use when building or debugging anything that runs in a browser. Use when you need to inspect the DOM,  |
| `bug-reproduction-brief` | github/awesome-copilot (curated) | 'Turn a vague, intermittent, or environment-specific bug report into a minimal evidence-backed reproduction before proposing a fix.' |
| `ci-cd-and-automation` | addyosmani/agent-skills | Automates CI/CD pipeline setup. Use when setting up or modifying build and deployment pipelines. Use when you need to automate quality gates, configur |
| `code-review-and-quality` | addyosmani/agent-skills | Conducts multi-axis code review. Use before merging any change. Use when reviewing code written by yourself, another agent, or a human. Use when you n |
| `code-review` | mattpocock/skills | "Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented co |
| `code-simplification` | addyosmani/agent-skills | Simplifies code for clarity. Use when refactoring code for clarity without changing behavior. Use when code works but is harder to read, maintain, or  |
| `code-tour` | github/awesome-copilot (curated) | > |
| `codebase-design` | mattpocock/skills | Shared vocabulary for designing deep modules. Use when the user wants to design or improve a module's interface, find deepening opportunities, decide  |
| `constraint-driven-development` | addyosmani/agent-skills | Establishes a project's quality bar as a written contract and stops agents quietly lowering it. Interviews the user on which dimensions matter, suppli |
| `context-engineering` | addyosmani/agent-skills | Optimizes agent context setup. Use when starting a new session, when agent output quality degrades, when switching between tasks, or when you need to  |
| `context-map` | github/awesome-copilot (curated) | 'Generate a map of all files relevant to a task before making changes' |
| `create-implementation-plan` | github/awesome-copilot (curated) | 'Create a new implementation plan file for new features, refactoring existing code or upgrading packages, design, architecture or infrastructure.' |
| `debugging-and-error-recovery` | addyosmani/agent-skills | Guides systematic root-cause debugging. Use when tests fail, builds break, something that worked yesterday broke, behavior doesn't match expectations, |
| `deprecation-and-migration` | addyosmani/agent-skills | Manages deprecation and migration. Use when removing old systems, APIs, or features. Use when migrating users from one implementation to another. Use  |
| `diagnosing-bugs` | mattpocock/skills | Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/failing |
| `diagnosing-superpowers` | obra/superpowers | Use when a superpowers session went wrong and your human partner wants to know why — repeated work, ignored plans, stumbles, poor results, a skill t |
| `dispatching-parallel-agents` | obra/superpowers | Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies |
| `documentation-and-adrs` | addyosmani/agent-skills | Records decisions and documentation, and detects when documentation has drifted from the code it describes. Use when you need to document an architect |
| `domain-modeling` | mattpocock/skills | Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a GLOSSARY.md, or recording or editing an ADR |
| `doubt-driven-development` | addyosmani/agent-skills | Subjects every non-trivial decision to a fresh-context adversarial review before it stands. Use when you want every assumption cross-examined before p |
| `executing-plans` | obra/superpowers | Use when executing an implementation plan in the current session as the implementer yourself — your human partner chose inline execution, or no suba |
| `finishing-a-development-branch` | obra/superpowers | Use when implementation is complete, all tests pass, and you need to decide how to integrate the work |
| `frontend-ui-engineering` | addyosmani/agent-skills | Builds production-quality, accessible, responsive user-facing UIs. Use when building or modifying interfaces and pages, creating components, implement |
| `git-guardrails-claude-code` | mattpocock/skills | Set up Claude Code hooks to block dangerous git commands (push, reset --hard, clean, branch -D, etc.) before they execute. Use when user wants to prev |
| `git-workflow-and-versioning` | addyosmani/agent-skills | Structures git workflow practices. Use when making any code change. Use when committing, branching, resolving conflicts, splitting uncommitted work in |
| `grill-me` | mattpocock/skills | A relentless interview to sharpen a plan or design. |
| `grill-with-docs` | mattpocock/skills | A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go. |
| `grilling` | mattpocock/skills | Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrase |
| `handoff` | mattpocock/skills | Compact the current conversation into a handoff document for another agent to pick up. |
| `idea-refine` | addyosmani/agent-skills | Refines raw ideas into sharp, actionable concepts through structured divergent and convergent thinking. Use when an idea is still vague, when you need |
| `implement-spec` | mattpocock/skills | "Implement the result of /to-spec and /to-tickets in code." |
| `implement` | mattpocock/skills | "Implement a piece of work based on a spec or set of tickets." |
| `improve-codebase-architecture` | mattpocock/skills | Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick. |
| `incremental-implementation` | addyosmani/agent-skills | Delivers changes incrementally in thin, verifiable slices. Use when implementing any feature or change that touches more than one file, or when pickin |
| `interview-me` | addyosmani/agent-skills | Extracts what the user actually wants instead of what they think they should want. Achieves this through one-question-at-a-time interview until ~95% c |
| `migrate-to-shoehorn` | mattpocock/skills | Migrate test files from `as` type assertions to @total-typescript/shoehorn. Use when user mentions shoehorn, wants to replace `as` in tests, or needs  |
| `observability-and-instrumentation` | addyosmani/agent-skills | Instruments code so production behavior is visible and diagnosable. Use when adding logging, metrics, tracing, or alerting. Use when shipping any feat |
| `performance-optimization` | addyosmani/agent-skills | Optimizes application performance across frontend, backend, queries, and databases. Use when performance requirements exist, when you suspect performa |
| `planning-and-task-breakdown` | addyosmani/agent-skills | Breaks work into ordered tasks. Use when you have a spec or clear requirements and need to break work into implementable tasks. Use when a task feels  |
| `pr` | mattpocock/skills | "Use when writing a PR body." |
| `proof-agent` | AndreaGriffiths11/proof-agent | Adversarial verification of AI-generated work. Spawns an independent verifier to check for false claims, broken code, and security issues. |
| `prototype` | mattpocock/skills | Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, or explor |
| `receiving-code-review` | obra/superpowers | Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires  |
| `requesting-code-review` | obra/superpowers | Use when completing tasks, implementing major features, or before merging to verify work meets requirements |
| `research` | mattpocock/skills | Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic res |
| `retro` | mattpocock/skills | "Conduct a retrospective on a coding session." |
| `scaffold-exercises` | mattpocock/skills | Create exercise directory structures with sections, problems, solutions, and explainers that pass linting. Use when user wants to scaffold exercises,  |
| `security-and-hardening` | addyosmani/agent-skills | Hardens code against vulnerabilities. Use when auditing an input handler for vulnerabilities, when handling user input, authentication, data storage,  |
| `setup-matt-pocock-skills` | mattpocock/skills | "Configure this repo for the engineering skills: set up its issue tracker, triage label vocabulary, and domain doc layout. Run once before first use o |
| `setup-pre-commit` | mattpocock/skills | Set up Husky pre-commit hooks with lint-staged (Prettier), type checking, and tests in the current repo. Use when user wants to add pre-commit hooks,  |
| `shipping-and-launch` | addyosmani/agent-skills | Prepares production launches. Use when preparing to deploy to production, or when asking what needs to be in place before shipping. Use when you need  |
| `source-driven-development` | addyosmani/agent-skills | Grounds every implementation decision in official documentation. Use when you want to verify an approach against the official docs before implementing |
| `spec-driven-development` | addyosmani/agent-skills | Creates specs before coding. Use when starting a new project, feature, or significant change and no specification exists yet. Use when drafting a PRD  |
| `subagent-driven-development` | obra/superpowers | Use when executing implementation plans with independent tasks in the current session |
| `superpowers-test-driven-development` | obra/superpowers | Use when implementing any feature or bugfix, before writing implementation code |
| `systematic-debugging` | obra/superpowers | Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes |
| `tdd` | mattpocock/skills | Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests. |
| `teach` | mattpocock/skills | Teach the user a new skill or concept, within this workspace. |
| `test-gap-audit` | github/awesome-copilot (curated) | Run a read-only audit for missing, weak, stale, or mis-scoped test coverage. If the user does not name a scope, audit the full repository and identify |
| `tiny-stepping` | github/awesome-copilot (curated) | Incremental development workflow that makes the smallest meaningful change per step and pauses for feedback, so the direction gets validated early bef |
| `to-questionnaire` | mattpocock/skills | Turn a decision you can't fully answer into a questionnaire for someone else to fill in. |
| `to-spec` | mattpocock/skills | "Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed. |
| `to-tickets` | mattpocock/skills | Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tr |
| `triage` | mattpocock/skills | Move issues and external PRs through a state machine of triage roles, categorise, verify, grill if needed, and write agent-ready briefs. |
| `understand-chat` | Egonex-AI/Understand-Anything | Use when you need to ask questions about a codebase or understand code using a knowledge graph |
| `understand-dashboard` | Egonex-AI/Understand-Anything | Launch the interactive web dashboard to visualize a codebase's knowledge graph |
| `understand-diff` | Egonex-AI/Understand-Anything | Use when you need to analyze git diffs or pull requests to understand what changed, affected components, and risks |
| `understand-domain` | Egonex-AI/Understand-Anything | Extract business domain knowledge from a codebase and generate an interactive domain flow graph. Works standalone (lightweight scan) or derives from a |
| `understand-explain` | Egonex-AI/Understand-Anything | Use when you need a deep-dive explanation of a specific file, function, or module in the codebase |
| `understand-figma` | Egonex-AI/Understand-Anything | Analyze a Figma file via the Figma REST API and generate an interactive design knowledge graph (pages, screens, components, component sets, instances, |
| `understand-knowledge` | Egonex-AI/Understand-Anything | Analyze a Karpathy-pattern LLM wiki knowledge base and generate an interactive knowledge graph with entity extraction, implicit relationships, and top |
| `understand-onboard` | Egonex-AI/Understand-Anything | Use when you need to generate an onboarding guide for new team members joining a project |
| `understand` | Egonex-AI/Understand-Anything | Analyze a codebase to produce an interactive knowledge graph for understanding architecture, components, and relationships |
| `using-agent-skills` | addyosmani/agent-skills | Discovers and invokes agent skills. Use when starting a session, or when you need to decide which skill or workflow applies to the piece of work at ha |
| `using-git-worktrees` | obra/superpowers | Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace ex |
| `using-superpowers` | obra/superpowers | Use when starting any conversation - establishes how to find and use skills, requiring skill invocation before ANY response including clarifying quest |
| `verification-before-completion` | obra/superpowers | Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming |
| `wait-what` | mattpocock/skills | "Stop. That last message did not land: re-pitch it." |
| `wayfinder` | mattpocock/skills | Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at a  |
| `webapp-testing` | github/awesome-copilot (curated) | Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, ca |
| `wizard` | mattpocock/skills | Generate an interactive bash wizard that walks a human through steps only they can perform. Use when provisioning infrastructure, setting up credentia |
| `writing-for-agents` | mattpocock/skills | Writing documents for agents. Use when creating or editing skills, or modifying AGENTS.md or CLAUDE.md. |
| `writing-plans` | obra/superpowers | Use when you have a spec or requirements for a multi-step task, before touching code |
| `writing-skills` | obra/superpowers | Use when creating new skills, editing existing skills, or verifying skills work before deployment |
