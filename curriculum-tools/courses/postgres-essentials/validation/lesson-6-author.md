# Lesson 6 author record

Date: 2026-09-06

## Authored identity and scope

- Source: `curriculum/04-row-lock.ts`
- Exported module: `ROW_LOCK`
- Exported diagram: `ROW_LOCK_VISUAL`
- Slug: `row-lock-protects-decision`
- Title: **Protect a read-modify-write decision with a row lock**
- Prerequisite: `lost-update-and-atomic-write`
- Owned table: `pe_stock`, dropped by the final command

The two rounds use one widget row. In the stale-decision round, both sessions read the last unit
before either changes it; both accept, and server-side arithmetic faithfully records the invalid
outcome. In the locking round, Session B's `SELECT ... FOR UPDATE` is labelled
`(blocks until A
commits)`. After A commits, B must read the committed zero and decline without
writing. No psql variables or conditionals, application scaffold, lock catalog, deadlock, `NOWAIT`,
`SKIP LOCKED`, or retry loop was added.

## Static and structural checks

The authored file passed:

- `deno fmt --check curriculum/04-row-lock.ts`
- `deno check curriculum/04-row-lock.ts`
- `git diff --check -- curriculum/04-row-lock.ts`
- `validateLessons` on the extracted draft after applying the course defaults
- `splitSteps`, which found ten labelled blocks across A and B and classified only the locking read
  in Session B as asynchronous/blocking

The slug and title match PLAN row 6. The optional reference names the isolation and row-lock
background relevant to this lesson. The write-up states the required limits: ordinary reads still
use MVCC, competing locking readers and writers participate, lock holding should stay short, and one
locked row cannot protect arbitrary multi-row or cross-service rules.

## Runtime evidence pending parent integration

The author did not create a private PostgreSQL cluster. The module is intentionally absent from the
shared catalog until the parent registers lessons 4–6 in prerequisite order, and the parent has a
single validation controller that runs the exact built blocks and externally observes the wait via
`pg_stat_activity` and `pg_blocking_pids`. Avoiding a second fixture also avoids redundant resource
use. This record must not be treated as real-tool acceptance until that registered run succeeds.

The parent acceptance run should assert all of the following:

- `a_stale_read = 1`, `b_stale_read = 1`, and both stale decisions are `accept`.
- `stale_remaining = -1` and `stale_accepted = 2`.
- Session B is externally observed waiting on Session A while its locking `SELECT ... FOR UPDATE` is
  pending; B produces no locking-read result before A commits.
- `a_locked_read = 1` with `accept`; after the wait, `b_locked_read = 0` with `decline`.
- `b_locked_action` is `no write: stock is exhausted`.
- `locked_remaining = 0`, `locked_accepted = 1`, with no `ERROR` or `FATAL` output.
- Both transactions finish and `pe_stock` no longer exists.

## Resource status

The pre-authoring check showed about 16 GB free on `/`, healthy inode and memory headroom, and the
sandbox did not expose PostgreSQL processes. No cluster, socket, database, backup, archive, or
retained runtime evidence was created by this author. The protected learner cluster and all progress
files were untouched. Learner readiness and the final process/space check remain part of the
parent's integrated validation and cleanup.

## Parent acceptance completed

After normalizing the timeouts and cleanup, clarifying statement snapshots versus row rechecks, and
adding the conditional-update alternative, the parent ran the exact built lesson independently on
PostgreSQL 16.15. All listed observations passed: stale stock -1 with two accepted reservations,
then protected stock 0 with one accepted reservation. The observer caught B's FOR UPDATE query
waiting on A's transactionid lock; after A committed, B returned 0 and decline. There were no
unexpected errors and pe_stock was removed. `lessons-6-outcomes.json` and `lessons-6-source.json`
record the evidence and source correspondence. The owned cluster was removed, and both progress
databases remained unchanged. Six-lesson rendering/navigation tests passed.
