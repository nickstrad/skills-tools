# PostgreSQL Systems course

The 92-lesson deep course progresses from pages/MVCC through concurrency, measured performance,
recovery, replication, durable protocols and independent incident diagnosis. Its task-runner
capstone requires complete request/effect reconciliation and a measured admission/concurrency
decision. [PLAN.md](PLAN.md) gives the current outline; [lesson-map.md](lesson-map.md) maps original
identities, consolidations and the seven reading stops. [validation/](validation/) contains actual
execution records, expected failure classifications and measurement limits.

## First operational task: resources and cleanup

Read `/root/disk-usage-report.md` when available, then verify disk, memory, inodes and live
processes using [the resource policy](../../../docs/knowledge/vm-resource-cleanup.md). The report is
historical, not a deletion allowlist. The learner's VM lab is `/labs/pglab/primary`, port 5440,
socket `/tmp`, database lab; verify current paths before operating it. Preserve learner data and
progress.

Destructive/restart author trials use unique private `/tmp/pg-owned-*` roots and sockets. Budget all
primary/standby/backup/restore/archive copies, keep at least 2 GB free and twice the next peak
footprint, and bound every process. Stop owned clients and servers on failure. Record needed
findings, then remove disposable raw state; a stopped server still consumes disk. Verify complete
archive hashes before removing raw evidence needed for an unfinished audit. Give retention an
explicit end point. Finish that audit, reclaim bulky inputs and recheck learner readiness before
declaring the goal done.

## Use the current essentials course

The learner path is now [PostgreSQL Essentials](../postgres-essentials/README.md), with a fixed
[40-lesson sequence](../postgres-essentials/PLAN.md) of 20–30 minute chunks. Its actual first six
lessons are ready; there is no requirement to take the old 9–12 coaching pilot.

```sh
bin/pgcoach route
bin/pgcoach 1 lesson
bin/pgcoach 1 review
bin/pgcoach 1 done
```

`pgcoach` defaults to the new course. Its numbering and progress are separate from this original
92-lesson reference. `pgcoach --reference NUMBER full` opens reference material; use
`tutor postgres ...` for reference progress/navigation. Do not use old completion numbers for new
lessons. The new flow teaches concepts and terminal diagrams before running; review explains the
observations. The next feedback point is after essentials lesson 6.

## Original reference experiments

The actual experiment commands run in the shell or psql context stated by each lesson. SQL lessons
can share the learner lab; private lifecycle fixtures initialize their own state. Some incident run
commands only prepare a stopped symptom packet: inspect and explicitly apply the chosen remedy
before treating the incident as recovered. The cancellation incident applies a policy to a fresh
equivalent trial after its survey is stopped. Record evidence and use its printed cleanup action.

The generic CLI is `../../bin/tutor postgres`. Its supported `init` command synchronizes built
lesson metadata into a catalog while preserving stable IDs/history/progress. Author validation uses
`init --db /tmp/owned-copy/progress.sqlite` on a SQLite backup of learner progress; it does not
refresh the real learner catalog implicitly. Apply a newly built catalog to the learner's database
only as authorized by the learner, through the CLI rather than direct database edits.

## Author and validate

Read repository AGENTS.md, [AUTHORING](../../docs/AUTHORING.md), the curriculum-author skill and
[the knowledge index](../../../docs/knowledge/README.md). Edit curriculum TypeScript and authored
guides. From curriculum-tools, build with `/root/.deno/bin/deno task build postgres`, then run the
appropriate real-tool checks, `deno task check` and `deno task test`. The generic SQL harness skips
shell lessons and its completion count does not classify errors; execute shell cores and exact
rendered hints independently and inspect complete outcomes.

Keep original completed lessons 1–7 unchanged. Preserve surviving slugs and existing learner state;
record consolidation coverage instead of transferring completions. Compare a fresh copied-catalog
render with the code actually executed. Shared-host measurements do not establish production SLOs,
election/consensus, network partitions or independent host availability.

The book research is canonical under `docs/books/postgresql-14-internals/` in the repository; this
course's docs symlink points there. Use its current citation/checkpoint maps and settled research
before opening the PDF. Do not duplicate the PDF or research into the course tree. General findings,
validation pitfalls and cleanup lessons belong in docs/knowledge and its index.
