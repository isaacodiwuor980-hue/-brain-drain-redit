# Historical brain-link detachment: review only

**Status: not approved for execution.** No historical links have been changed. The owner chose to detach links to a brain when it becomes private, preserving the post and brain. This document is a proposed plan, not authorization to deploy proposal 0019, update live rows, restore data, or change writers.

## Current evidence and scope

A previously authorized aggregate-only query of the connected Supabase project returned **zero** posts linked to nonpublic brains and **zero** posts linked to missing brains at that instant. This is a point-in-time observation, not proof that no future invalid links, embedded identifiers, other routes, stale caches or direct-access leaks exist. No post contents, individual IDs or account details were requested by that query. The connected project is the existing project, not a confirmed disposable test project.

If a later separately approved check finds affected links, the proposed target is **only** `public.posts.brain_id` where a linked `public.brains` row is missing or its `is_public` is not true. Set that field to NULL. Do not delete or edit post content, brain content, accounts or other links. Treat an unknown/null visibility as nonpublic. A post can still contain a brain identifier in content or cached copies; this operation does not sanitize those surfaces. No user-level inspection or export is authorized by the aggregate-check permission.

## Before requesting execution approval

1. Independently validate the live schema, foreign keys, triggers, constraints, all write paths, RLS/role privileges and API/cache behavior, without accessing user-level data unless separately approved. Confirm the current proposal is compatible and separately review its deployment and rollback. Establish a way to stop all writes that can attach links or change visibility, including privileged, direct, scheduled and external writers; if a complete freeze cannot be guaranteed, stop and redesign the locking approach.
2. In a verified separate disposable environment, rehearse the exact intended schema changes and repair with synthetic data, all actual roles and relevant policies. Test failures, lock ordering, concurrent privacy changes and attachment attempts, retries, cleanup and cache handling. The small transactional-schema rehearsal is not a substitute and is currently blocked pending confirmation of connector session/rollback behavior.
3. Have the owner explicitly approve the exact current target, full SQL/operational steps, maintenance window, retention and deletion of backups, and a reviewed rollback plan. A previous zero count is not approval to modify future rows. Refresh aggregate counts under separate authorization immediately before action, and stop for unexpected counts or schema, permissions, behavior, constraints or failing verification.
4. Confirm a restorable, access-restricted backup and recovery process, its retention and deletion schedule, and who can access it. A backup of links can itself reveal private associations; minimize it and never place it in logs, chat or Git. Test restoration on disposable synthetic data. Full-database restoration could overwrite newer changes and privacy decisions, so is not an automatic rollback.

## Candidate mutation (illustrative; DO NOT RUN)

The exact final statement must be reviewed against the then-current schema and the approved writer freeze. For discussion only, the intended set-based mutation is:

```sql
UPDATE public.posts AS p
SET brain_id = NULL
WHERE p.brain_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.brains AS b
    WHERE b.id = p.brain_id AND b.is_public IS TRUE
  );
```

This predicate covers both missing and nonpublic brains. It must not be run as a standalone fix: concurrent changes can invalidate the snapshot, existing triggers may have side effects, and the operation could block or deadlock. Determine lock and statement timeouts, transaction size, retry/abort strategy and batch consistency through isolated rehearsal. Never log affected identifiers or content. Verify both update count and post-repair aggregate counts while the write freeze remains in place. If checks fail, stop; do not blindly retry or release writers with the system in an unknown state.

## Replacement protection, recovery and cleanup

- A one-time repair alone does not stop recurrence. A separately approved, validated database-level protection and audited writers must be in place before lifting the freeze. Review 0019's trigger ownership, permissions, locking, side effects and concurrency on real PostgreSQL; local passing tests do not establish live RLS safety. Review how existing API validation and response redaction interact with it.
- Detachment is intentionally not automatically reversed. Reattaching a private or missing brain could recreate the leak and override a later privacy choice. If recovery is necessary, stop writers and design a separately approved, visibility-aware, per-link recovery using the protected backup and current state. Verify authorization and content preservation; otherwise retain detached links. Do not simply restore an old database snapshot to production.
- Review and invalidate only authorized affected caches/replicas, and inspect other delivery paths and embedded content under separate approved scope. Record aggregate outcomes, execution time, verification, anomalies and backup deletion evidence without identifiers or content. Delete the restricted temporary backup only under its explicitly approved retention plan; verify cleanup. Confirm service health and monitoring before lifting the freeze. An incident or discrepancy means pause and escalate, not silently proceed.

## Remaining limitations

The candidate SQL and operational procedure have not been exercised against the live schema or production roles. Current API safeguards are local/PR changes and do not protect direct database reads, every writer or every route. There is no production-ready claim, deployment or permission here to purge analytics or delete accounts. The latest aggregate zero means there is no known historical repair to perform now; it does not make preventative protection unnecessary.
