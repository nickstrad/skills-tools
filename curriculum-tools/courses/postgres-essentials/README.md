# PostgreSQL Essentials

The current path is **40 meaningful lessons of 20–30 minutes**, after the eight PostgreSQL lessons
already completed. The [full sequence and intended outcomes](PLAN.md) fixes the scope. **The first
six are available**; the remaining 34 are planned and will be authored in small batches.

1. An uncommitted write is private to its transaction.
2. Choose a fresh statement view or a stable transaction view.
3. An old reader can prevent vacuum from removing history.
4. Reusable space is different from a smaller file.
5. Lose an update, then keep arithmetic in the database.
6. Protect a read-modify-write decision with a row lock.

These are the actual first lessons of the route. They use small account, history and stock tables to
connect visibility, cleanup, concurrent arithmetic and protected decisions. No TOAST/cache/XID tour
or new cluster installation is needed before starting them.

## Use

```sh
pgcoach route
pgcoach 1 lesson
pgcoach 1 review
pgcoach 1 done
pgcoach
```

The launcher is `../postgres/bin/pgcoach` if it is not on PATH. `lesson` contains the concepts,
terminal diagram, purpose, setup and commands; `review` explains observed evidence and insights.
`full` adds optional reading references. Only explicit `NUMBER done` records completion. A mental
reflection follows the experiment; a brief feedback chat after lesson 6 guides the next batch. There
are no typed answers, required notes or separate pause/resume state.

To initialize or refresh the available lesson catalog while preserving completions, run this from
`curriculum-tools/`:

```sh
bin/tutor postgres-essentials init
```

The original 92-lesson course and its progress are preserved. It remains accessible with
`pgcoach --reference NUMBER full` and `tutor postgres ...`. The new essentials numbering is 1–40;
the original eight completions are prerequisites by learner context, not completions of these new
experiments. `pgtutor` is a legacy wrapper; use the printed `pgcoach NUMBER done` for essentials.

## Lab and validation

Use the existing `/labs/pglab/primary` learner cluster through `/tmp`, port 5440, role postgres,
database lab. Each lesson prepares only its own `pe_*` table and drops it at the end. Finish any
earlier transactions before setup. Lesson 4 uses one experiment terminal; the others use two. To
stop early, ROLLBACK in each open experiment session, then drop the exact table named by that
lesson's final command. Lessons 3–4 leave the shared pgstattuple extension installed; their
table-specific autovacuum settings disappear with their tables.

The 20–30 minute ranges include reading, commands, reflection and cleanup but await learner timing
feedback. Optional book references do not add mandatory homework. PostgreSQL 16 validation and
cleanup evidence are under `validation/`; `validate.py` allocates and removes a private cluster.
