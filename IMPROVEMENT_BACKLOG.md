# Requested improvements — working backlog

The TSRG implementation is left unchanged. This document records work still needed; it is not evidence of a completed audit or production readiness.

## Implemented in this pass
- Story notes accept text, HTTP(S) links, local image/PDF files and HTML displayed as escaped text. Notes are stored only in this browser; files are not uploaded. The viewer offers a pause control for reading attachments. Local storage failures are surfaced.
- A local two-answer practice scenario can be created and scored. It is not shared and awards no XP. Attempt timing uses elapsed time and attempts are filtered by current user ID. This does not provide server-backed exams or cross-device sharing.
- Search now observes wouter's search string separately from the path, so changing `?q=` while staying on the search page can update the query.

## Remaining requested work
- Quick-search and discover sidebar: browser-test interactions; replace hard-coded popularity, network and contributor entries with real data and working destinations. The sidebar currently presents static examples as real data.
- Replace topics with circles throughout navigation, feed, search, APIs and storage. Preserve existing user data, old links and migration/rollback; the requested permanent removal has not been performed.
- Post composition: create a custom decision brain from an answer; configurable readable backgrounds for text notes; verify publishing and media persistence end-to-end.
- Scenario creator: multiple questions, editing, answer explanations, moderated sharing, authoritative scoring and meaningful privacy/permissions.
- Brain branches: atomic fork and graph/root remapping, isolated branch editor/runtime, authenticated author review and merge with conflict handling. Current branch storage is local and does not establish author authorization or cloud collaboration.
- Pathways and real-human coordination: inspect and test user journeys and persistence; do not represent local-only collaboration as live multi-user coordination.
- Circles: real circle detail routes, membership, content and moderation; full-screen three-panel live room with library, participants and controls. Existing sessions are local-only and need a real-time service, media permissions, recording consent and access control before claiming live operation.
- Settings: research, design and implement accessibility, privacy, security, data portability and developer options with clear scope and safe defaults. Test across devices and keyboard/screen readers.
- Dependency audit: `npm audit --omit=dev` reported no vulnerabilities; full audit reported 9 moderate findings. Evaluate safe upgrades and compatibility individually instead of forcing breaking updates.

## Safety references
- WCAG 2.2 keyboard operation and visible focus: https://www.w3.org/TR/WCAG22/
- OWASP file-upload guidance: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html. Current file checks are client-side usability checks, not sufficient security for a future upload service; server-side validation, safe storage and content handling are required.
