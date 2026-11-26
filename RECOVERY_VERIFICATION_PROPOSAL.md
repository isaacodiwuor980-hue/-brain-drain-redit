# Recovery verification proposal — current project

**Planning only.** No production migration, backup, export, restoration, test write, resource creation, setting change, deployment or deletion is authorized by this proposal. The owner wants the current Supabase project as the target, no new project at present, avoidance of paid features, and plans/documentation only until recovery is verified. A live change remains subject to the prior verified-recovery condition and specific approval for each stage.

## What is known

- **Owner-reported, not independently verified:** the current Supabase dashboard shows a backup and the project is on the free plan. A backup listing does not prove that it is current, complete, or restorable. Exact feature availability and cost depend on the provider and plan.
- **Targets, not guarantees:** 30-day backup retention, at most 24 hours of changes lost and 24 hours to recover. None has been verified. The owner will authorize an actual restore, after seeing its exact effect; authorized recovery administrators alone may access backup data.
- It is unknown whether pilot-relevant Firebase, Firestore, Storage objects or other services are recoverable. Supabase database backups exclude Storage object contents. Deletion/privacy changes must not be silently undone by a restore.
- A visible backup or a read-only demonstration alone cannot prove that a restore will work. No isolated destination is approved or available today. The owner asked to review provider recovery evidence and testing options; this does not waive the earlier recovery gate.

## Step 1 — owner dashboard check, no settings changed

The owner can open the current project's database Backups page and provide a **redacted screenshot**, or a brief text summary, showing only the plan name, whether a recovery point is listed, its date/time and timezone, available retention/recovery window, and any visible feature or plan restrictions. Before sharing, remove project identifiers if unnecessary, account names/emails, content, tokens, keys, URLs and connection strings. Do not press restore, enable paid features, change settings or create a project. It is okay if details are unavailable; mark them unknown. This voluntary check does not establish actual restore ability.

## Step 2 — proposed metadata-only inspection, not executed

If dashboard evidence is insufficient, first present the **exact** connector operation, project scope, fields and expected output for review and approval. Inspect only provider backup metadata or schema/permission metadata if an existing supported tool explicitly offers it. Do not read account rows, personal content, secrets, key values or connection strings; do not run an export or a write. Whether the connector exposes backup status and whether its response contains sensitive fields are **unverified**; if it cannot limit the output safely, stop and use the owner's redacted dashboard summary. A metadata response is evidence of configuration, not proof of recoverability.

## Step 3 — inventory without content

List which app services are actually needed for the pilot (database schema/data and privileges, Firebase Auth and configuration, any Firestore use, Storage objects and configuration, application deployment/settings, other operational dependencies). Confirm ownership, authorized operators, retention, independent recovery method and known gaps. Do not retrieve account-level rows or secrets for this inventory. Keep media disabled if unverified as previously chosen. Firebase and other services required for the pilot must have a verified recovery approach before launch. Minimal non-content log policy and retention also need provider verification.

## Step 4 — compare recovery verification options before action

1. **Provider listing and documentation:** may establish availability and stated method, but does not prove this project's backup restores or cover all services. No data modification.
2. **Restore to an isolated destination:** could test recovery, but user currently does not want another project; plan capabilities, cost, data exposure, access restrictions, cleanup and explicit approvals must be reviewed first. A separate destination is not currently authorized. If not available, do not pretend it was tested.
3. **Logical export plus isolated restoration:** may provide independent evidence only with a safe, approved destination and verified scope, permissions and consistency. It can contain sensitive data, excludes external services unless separately covered and might require tools/access/costs. Do not run the existing backup script: it exposes a database URL as an argument and automatically removes older archives. No export or drill is approved.
4. **Restore over current project:** destructive to newer changes and unsuitable as a drill. Never execute without an exact incident-specific approval and a recovery plan; do not use to work around the lack of a safe destination.

If no acceptable method meets the owner's recovery condition, keep live migration and launch blocked. Present limitations and options rather than claiming readiness. Exact test and approval criteria must be agreed before doing any drill; a synthetic-only restore may test mechanics but does not prove this project's backup is restorable.

## Future approved change, not a request to execute

For every stage: show the exact SQL/deployment, affected systems, dependencies and experimental data, downtime/maintenance window, backup and recovery evidence, privacy risks, monitoring, verification, rollback and cleanup; obtain separate approval. Stop on unknown backup, ownership, access, schema or unsafe writer. A rollback may not reverse data already exposed or overwritten. After any approved incident restore, keep access paused until deletion/privacy state is rechecked and reconciled, then separately review reopening. Retain backups only under restricted access, with the owner's selected expiry approach and any applicable legal requirements reviewed. Do not delete experimental accounts or data without an exact approved plan.
