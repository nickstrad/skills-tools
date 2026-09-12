# PostgreSQL Essentials

The current path is **40 bounded lessons**, after the eight PostgreSQL reference lessons already
completed. The [full sequence and intended outcomes](PLAN.md) fixes the scope. **The first 26 are
available**; the remaining 14 are planned and will be authored in small batches. The plan's
20–30-minute figures are older author estimates; Nick currently reports about ten minutes per
lesson.

1. An uncommitted write is private to its transaction.
2. Choose a fresh statement view or a stable transaction view.
3. An old reader can prevent vacuum from removing history.
4. Reusable space is different from a smaller file.
5. Lose an update, then keep arithmetic in the database.
6. Protect a read-modify-write decision with a row lock.
7. Reject a stale edit with a version check.
8. Two valid decisions can break one shared rule.
9. Make the conflicting decision fail under Serializable.
10. Retry a known-aborted transaction from the beginning.
11. A lost response leaves the commit outcome unknown.
12. Reconcile a repeated request by its durable identity.
13. Find the transaction controlling a wait.
14. Cause a deadlock and explain the cycle.
15. A deadline does not always end the transaction.
16. Read a plan as measured work.
17. Repair a misleading row estimate.
18. An index can stop being the cheaper path.
19. Match an index to filtering and ordering.
20. Covering the columns is only half an index-only scan.
21. Make a sort spill, then bring it back into memory.
22. A join adds another memory consumer.
23. Connect commit acknowledgement to durable log work.
24. Measure WAL per useful operation.
25. A checkpoint writes pages without ending transactions.
26. Reconcile committed and aborted work after a crash.

These are the actual first lessons of the route. They use small account, history and stock tables to
connect visibility, cleanup, concurrent arithmetic, protected decisions, conflict detection and
retries, request reconciliation, transaction lifetime and measured query work. No TOAST/cache/XID
tour is needed before starting them. Lessons 25–26 supply their own temporary server fixtures.

## Use

```sh
pgcoach route
pgcoach 1 lesson
pgcoach 1 done
pgcoach
```

The launcher is `../postgres/bin/pgcoach` if it is not on PATH. `lesson` is the complete unit:
concise mechanism explanation, a labelled terminal diagram when useful, setup and commands, expected
evidence, interpretation, optional references or variations, and cleanup. Diagrams appear before
commands and remain readable without ANSI colour. Only explicit `NUMBER done` records completion.
There are no typed answers, required notes, homework, reading checkpoints, separate review stage, or
pause/resume state. Older `review`, `full`, and `start` spellings remain hidden compatibility
aliases for `lesson`.

The same reusable flow is available to every course through `tutor <course> <number> lesson|done`;
`tutor <course> lesson` opens its next unfinished lesson. New courses do not need their own
renderer. `tutor <course> route` shows completed, available, and planned entries, matching
`pgcoach route`.

To initialize or refresh the available lesson catalog while preserving completions, run this from
`curriculum-tools/`:

```sh
bin/tutor postgres-essentials init
```

The original 92-lesson course and its progress are preserved. It remains accessible with
`tutor postgres NUMBER lesson` and legacy `pgcoach --reference` forms. The new essentials numbering
is 1–40; the original eight completions are prerequisites by learner context, not completions of
these new experiments. `pgtutor` is a legacy wrapper; use the printed `pgcoach NUMBER done` for
essentials.

## Lab and validation

Use the existing `/labs/pglab/primary` learner cluster through `/tmp`, port 5440, role postgres,
database lab. SQL lessons prepare and drop only their named pe_* table; finish earlier transactions
before setup. Lessons 4 and 16–24 use one experiment terminal; the other SQL lessons use two.
Lessons 10–11 use one shell with supplied Python 3/psql clients that create unique pe_retry_* or
pe_unknown_* schemas, open their own connections and remove the schemas on exit. To stop early,
ROLLBACK in each SQL session, restore settings as shown and drop the exact lesson table. For shell
clients, Ctrl-C runs cleanup; check the schema-removal record. Lessons 3–4 leave the shared
pgstattuple extension installed; table-specific autovacuum settings disappear with their tables.

Lessons 12–14 deliberately wait: switch to the other terminal as instructed. Lessons 14–15 include
expected SQL errors with immediate SQLSTATE evidence; follow the recovery commands before reusing
the connection. The error inventory and cleanup are part of each experiment.

The old 20–30 minute ranges included explanation, commands, interpretation, and cleanup, but were
not measured learner timings; observed pace is now roughly ten minutes. Optional book references do
not add homework. PostgreSQL 16 validation and cleanup evidence are under `validation/`;
`validate.py` allocates and removes a private cluster.

Lessons 25–26 use one shell with supplied PostgreSQL 16 controllers. They create unique private
clusters, perform the checkpoint or crash experiment, stop the private servers and remove their
files. They ignore inherited PostgreSQL connection variables and accept no existing target path.
Ctrl-C runs cleanup; check the owned-cluster removal record. The learner server is preserved. See
[batch-six validation](validation/batch-six.md) for measured outcomes and limitations.
