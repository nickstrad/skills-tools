# PostgreSQL Systems course

The 92-lesson deep reference course progresses from pages/MVCC through concurrency, measured
performance, recovery, replication, durable protocols and independent incident diagnosis. Its
task-runner capstone requires complete request/effect reconciliation and a measured
admission/concurrency decision. [PLAN.md](PLAN.md) gives the current outline;
[lesson-map.md](lesson-map.md) maps original identities and consolidations without transferring
completions. [validation/](validation/) contains actual execution records, expected failure
classifications and measurement limits.

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
[40-lesson sequence](../postgres-essentials/PLAN.md). Its first 26 lessons are available. The stored
20–30-minute figures are historical author estimates; Nick currently reports roughly ten minutes per
lesson. There is no requirement to take the old 9–12 coaching pilot.

```sh
cd /root/Software/skills-tools
bin/tutor postgres route
bin/tutor postgres 1 lesson
bin/tutor postgres 1 done
```

This reference course has its own course identity and progress history inside the shared
`curriculum-tools/tutor.sqlite` database. Use `tutor postgres NUMBER lesson` for reference content and
`tutor postgres route` for reference navigation; the Essentials route is
`tutor postgres-essentials route`.
Do not use old completion numbers for new lessons. `lesson` includes the concepts, labelled terminal
diagram, commands, expected evidence, interpretation, and cleanup. Older `review`, `full`, and
`start` spellings are compatibility aliases, not separate stages. Only explicit `NUMBER done`
records completion.

## Original reference experiments

The actual experiment commands run in the shell or psql context stated by each lesson. SQL lessons
can share the learner lab; private lifecycle fixtures initialize their own state. Some incident run
commands only prepare a stopped symptom packet: inspect and explicitly apply the chosen remedy
before treating the incident as recovered. The cancellation incident applies a policy to a fresh
equivalent trial after its survey is stopped. Record evidence and use its printed cleanup action.

From the repository root, `bin/tutor postgres` is the generic CLI. Its `init` command synchronizes Markdown lesson
metadata into the shared catalog while preserving stable IDs, course history and progress. Author
validation uses `init --db /tmp/owned-copy/tutor.sqlite` on a copied database; it does not refresh
the real learner catalog implicitly. Apply newly authored lessons through the CLI rather than
direct database edits.

## Author and validate

Read repository AGENTS.md, [AUTHORING](../../docs/AUTHORING.md), the curriculum-author skill and
[the knowledge index](../../../docs/knowledge/README.md). Edit Markdown lesson files under
`lessons/`. The retired coaching guides are archived reference material. From curriculum-tools,
run `tutor postgres check`, then the appropriate real-tool checks and `tutor postgres validate`.
The generic SQL harness skips
shell lessons and its completion count does not classify errors; execute shell cores and exact
rendered hints independently and inspect complete outcomes.

Keep original completed lessons 1–7 unchanged. Preserve surviving slugs and existing learner state;
record consolidation coverage instead of transferring completions. Compare a fresh copied-catalog
render with the code actually executed. Shared-host measurements do not establish production SLOs,
election/consensus, network partitions or independent host availability.

External technical sources may inform author research, but lessons supply their own context and the
learner has no assigned reading stop. General findings, validation pitfalls and cleanup lessons
belong in docs/knowledge and its index.
