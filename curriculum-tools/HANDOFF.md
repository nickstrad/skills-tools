# Handoff: PostgreSQL systems curriculum + general tutor engine

Last updated: 2026-09-03 12:02 UTC. **Update this file after every module and before any risky
step.**

## What the user asked for

1. (22:33) "look at the lessons in pg tutor, take a pass at improving, replacing, altering
   curriculum with goal of me learning postgresql to be a better systems/distributed systems
   software engineer"
2. (22:58) "use luna subagents on high to run the experiments and guide them so you don't use fable
   tokens the whole time and just verify their work as you progress"
3. (23:08) Create and maintain this handoff. Confirmed scope: finish the pg tutor curriculum
   rewrite, finish the general curriculum-authoring skill/engine, use the harness + Opus subagents
   (the user said "opus ... low effort" in this message and "luna ... high" earlier; there is no
   "luna" model, so **Opus subagents** are used) to run/validate lessons, and verify their work.

## Where everything is

| Path                                                                                   | What                                                                                                                                                      | Status                                                                                                                             |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/root/Software/skills-tools/pg-systems-tutor/`                                        | ORIGINAL standalone tool, 100 read-only catalog lessons. Kept in the repo as-is.                                                                          | Untouched.                                                                                                                         |
| `/root/Software/skills-tools/`                                                         | Git repo (origin github.com/nickstrad/skills-tools). The user moved everything here on 2026-09-03; `/root/test/tutor` is a stale copy, do not work there. | Commit + push after each verified batch.                                                                                           |
| `/root/Software/skills-tools/curriculum-tools/`                                        | The general engine: one CLI, many courses.                                                                                                                | Engine DONE (8 tests pass, `deno task check` clean).                                                                               |
| `/root/Software/skills-tools/curriculum-tools/skills/curriculum-author/SKILL.md`       | General skill for making a curriculum tool like pgtutor for any tool.                                                                                     | Written; refine after the postgres course proves the workflow.                                                                     |
| `/root/Software/skills-tools/curriculum-tools/docs/AUTHORING.md`, `docs/VALIDATION.md` | Lesson contract, pedagogy, harness usage.                                                                                                                 | Written.                                                                                                                           |
| `/root/Software/skills-tools/curriculum-tools/tools/validate.ts`                       | Harness: drives one real REPL process per session, splits code on `-- Session X` headers, `(blocks` headers are sent without waiting, 30 s step timeout.  | Works (validated lessons 2-4 on the lab).                                                                                          |
| `/root/Software/skills-tools/curriculum-tools/courses/postgres/`                       | The PostgreSQL course. `curriculum/NN-*.ts` -> `deno task build postgres` -> `lessons.json`.                                                              | Module 01 (4 lessons) written + validated. Modules 02+ are the remaining work.                                                     |
| `/root/Software/skills-tools/curriculum-tools/courses/postgres/PLAN.md`                | Lesson-by-lesson specs for ALL 15 modules; subagents work from it.                                                                                        | Written 23:18. Stub files 02-15 exist and are registered in mod.ts with empty lesson lists, so subagents only edit their own file. |
| `/root/Software/skills-tools/curriculum-tools/courses/{sqlite,duckdb}/`                | Scaffolded placeholder courses proving `new-course` works.                                                                                                | Placeholder only; not in scope to fill.                                                                                            |

Deno: `/root/.deno/bin/deno` (not always on PATH; use the full path). Run all engine commands from
`/root/Software/skills-tools/curriculum-tools`.

## The lab (already built)

Built by running lesson 1 verbatim as OS user `postgres`: `$PGLAB=/var/lib/postgresql/pglab`, data
dir `$PGLAB/primary`, port 5440, socket `/tmp`, trust auth, db `lab`, wal_level=logical, checksums
on, archive_mode on -> `$PGLAB/archive`, pg_stat_statements preloaded, log at
`$PGLAB/primary/log/postgresql.log`. Extensions from lesson 3 are installed in `lab`. A separate
system cluster (16/main, port 5432) exists and must NOT be touched.

Rebuild if broken:

```sh
su - postgres -c 'export PATH=/usr/lib/postgresql/16/bin:$PATH; pg_ctl -D $HOME/pglab/primary stop -m immediate; rm -rf $HOME/pglab'
python3 -c "import json;print(json.load(open('/root/Software/skills-tools/curriculum-tools/courses/postgres/lessons.json'))[0]['code'])" > /tmp/lesson1.sh
su - postgres -c 'bash /tmp/lesson1.sh'
cd /root/Software/skills-tools/curriculum-tools && deno run -A tools/validate.ts postgres 3   # reinstalls extensions
```

Archive growth: `archive_mode = on` keeps every WAL segment in `$PGLAB/archive` forever. When disk
gets tight, delete everything older than the newest base backup's start segment (from
`$PGLAB/backup1/backup_label`, "START WAL LOCATION ... (file X)"):
`su - postgres -c 'export PATH=/usr/lib/postgresql/16/bin:$PATH; pg_archivecleanup $HOME/pglab/archive X'`
(done 2026-09-03 11:35 with X=0000000100000000000000A3: 6.2 GB -> 3.6 GB).

Machine limits: was 1 CPU / ~960 MB RAM when modules 01-07 were written; on 2026-09-03 01:45 the
droplet reports 4 CPUs, 8 GB RAM, ~11 GB disk free. Docker is installed for scripts/docker/test.sh
but must stay stopped and disabled when idle (user wants the memory); test.sh starts/stops it
itself. Keep tables small (<= 200k rows), run at most 2 validation runs concurrently, and give each
parallel module its own database (`PGDATABASE=lab_<module>` overrides the harness env; lessons
themselves still say `lab`).

## Process per module (repeat until the status table is all done)

1. Fable writes the module spec into `courses/postgres/PLAN.md` (slugs, the phenomenon each lesson
   causes/observes, key commands, expected outcome, systems lens).
2. Spawn an **Opus** subagent (general-purpose, model `opus`) with the prompt template below. It
   writes `curriculum/NN-<module>.ts`, registers it in `curriculum/mod.ts`, builds, runs the harness
   on its own database, fixes lessons until output matches `expectedResult`, and reports per-lesson
   evidence (actual output excerpts).
3. Fable verifies: read the diff, re-run the harness on 2-3 of the module's lessons (especially
   multi-session ones), check `deno task check`, fix anything wrong. Mark status here.
4. Cluster-level modules run **serially**, never in parallel with another module's validation: 07
   wal (crash lessons), 08 checkpoints (crash, PITR), 09 replication, 13 observability (needs a
   max_connections restart), 15 incidents. Parallel-safe (own database): 02-06, 10, 11, 12, 14.
   Order from 2026-09-03: 10+11+12 in parallel, then serially 07 -> 08 -> 13 -> 14 (its 2PC lesson
   restarts the server) -> 09 -> 15.

Subagent prompt template (fill MODULE, FILE, DB):

```
Read /root/Software/skills-tools/curriculum-tools/HANDOFF.md, /root/Software/skills-tools/curriculum-tools/docs/AUTHORING.md, docs/VALIDATION.md,
courses/postgres/curriculum/01-lab.ts (reference style) and the "MODULE" section of
courses/postgres/PLAN.md. Write courses/postgres/curriculum/FILE as a Module export named <NAME>,
one Draft per lesson in the spec, add it to curriculum/mod.ts after the previous module.
Then: cd /root/Software/skills-tools/curriculum-tools && deno task build postgres && deno fmt && deno task check.
Create your validation database as postgres: su - postgres -c 'createdb -h /tmp -p 5440 DB' and
install the same extensions as lesson 3 there. Validate with
PGDATABASE=DB deno run -A tools/validate.ts postgres <slugs...>. Shell lessons: run by hand as
`su - postgres -c '...'`. Compare every session's real output with expectedResult; edit the lesson
until expectedResult states what actually happened (numbers, error text, wait events). Never
touch the 16/main cluster on port 5432. Never edit lessons.json by hand. Do not mark progress.
Report: per lesson, PASS/FAIL, the key output lines proving the phenomenon, and anything you
changed from the spec and why.
```

## Module status

| #  | File                | Module                                                      | Lessons | Status                                                                                                                                                                                    |
| -- | ------------------- | ----------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 | 01-lab.ts           | lab-setup                                                   | 4       | DONE, validated                                                                                                                                                                           |
| 02 | 02-storage.ts       | storage: pages, tuples, buffers                             | 7       | DONE, validated; Fable re-ran 2-3 lessons OK 2026-09-03 00:45 (fixed `order by backend_xmin` -> `age(backend_xmin) desc`, xid has no ordering operator)                                   |
| 03 | 03-mvcc.ts          | mvcc: versions, snapshots, horizons                         | 6       | DONE, validated; Fable re-ran 2-3 lessons OK 2026-09-03 00:45 (fixed `order by backend_xmin` -> `age(backend_xmin) desc`, xid has no ordering operator)                                   |
| 04 | 04-vacuum.ts        | vacuum: dead tuples, VM, bloat, freeze                      | 6       | DONE, validated; Fable re-ran 2-3 lessons OK 2026-09-03 00:45 (fixed `order by backend_xmin` -> `age(backend_xmin) desc`, xid has no ordering operator)                                   |
| 05 | 05-isolation.ts     | transactions & isolation anomalies                          | 7       | DONE, subagent-validated, Fable re-ran write-skew/serializable-ssi/repeatable-read-blocks-then-fails OK (23:32)                                                                           |
| 06 | 06-locking.ts       | locks, queues, deadlocks, DDL                               | 8       | DONE, subagent-validated, Fable re-ran deadlock/lock-queue/ddl-behind-long-query OK (23:45)                                                                                               |
| 07 | 07-wal.ts           | WAL records, durability, crash redo                         | 7       | DONE; Fable re-ran 4 harness lessons OK 01:35 (crash/pg_waldump/pgbench lessons validated by hand by the subagent; crash lesson needs Session B commit to force the ghost record to disk) |
| 08 | 08-checkpoints.ts   | checkpoints, recovery, PITR                                 | 6       | DONE; Fable re-ran anatomy/max-wal-size/timeline OK 01:55. Leaves $PGLAB/backup1 (330 MB) for module 09; archive is 2.7 GB and growing (archive_mode on), watch `df`                      |
| 09 | 09-replication.ts   | physical streaming replication, failover                    | 8       | DONE; Fable rebuilt the standby from lesson 52 and re-ran lag/conflict OK 12:00, then removed it. Primary is now on timeline 3 (promote + rewind + failback)                              |
| 10 | 10-logical.ts       | logical decoding, CDC, pub/sub                              | 6       | DONE; Fable re-ran decode/pubsub/slot-lag OK 01:05 (lesson 6 switched to lg_orders so it does not depend on lesson 4 state)                                                               |
| 11 | 11-planner.ts       | planner, statistics, execution                              | 7       | DONE; Fable re-ran stats/spill/parallel OK 01:02                                                                                                                                          |
| 12 | 12-indexes.ts       | btree internals, concurrent builds, bloat                   | 6       | DONE; Fable re-ran cic/bloat OK 01:00 (lesson 3 uses 3 sessions: RR snapshot cannot see the new pg_index row)                                                                             |
| 13 | 13-observability.ts | wait events, pg_stat_io, capacity                           | 6       | DONE; Sonnet validated + corrected expected results (pg_stat_io needs parallel query off, idx_tup_fetch small because of index-only scans), Fable re-ran 3 lessons OK                     |
| 14 | 14-patterns.ts      | distributed patterns: outbox, queues, 2PC, fencing          | 7       | DONE; Fable re-ran outbox/OCC/fencing/notify OK 11:30 (2PC lesson single-session with 3 restarts; read-your-writes uses logical replication to lab_rr)                                    |
| 15 | 15-incidents.ts     | capstone incidents: slot fills disk, corruption, wraparound | 5       | IN PROGRESS (opus subagent, cluster-level, started 12:02)                                                                                                                                 |

## Ship (after all modules validated)

1. `deno task build postgres && deno task check && deno task test`, bump `course.json` revision if
   lessons changed after a learner could have started.
2. `bin/tutor postgres init` then `bin/tutor postgres modules` and `pretty 1`.
3. Install the wrapper skill: symlink
   `/root/Software/skills-tools/curriculum-tools/courses/postgres/skill/postgres-tutor` into
   `~/.codex/skills/` and `~/.claude/skills/`. Decide with the user whether to remove the old
   `~/.codex/skills/pg-systems-tutor` symlink (it points at the 100-lesson tool).
4. Refine `skills/curriculum-author/SKILL.md` with what the postgres pass taught (harness tips,
   subagent workflow), and install it too.
5. Final commit: delete this HANDOFF.md from the repo (user request); the README and docs are the
   durable documentation.

## Decisions and constraints

- Rewrite, not patch: the original 100 lessons are all read-only catalog queries with placeholder
  expected results, so none were kept as-is. Useful catalogs/views from them are folded into
  experiments as the observation step.
- Every lesson must cause a phenomenon and observe it (setup, action, observation, expected result,
  systems lens). Two-session experiments for anything about concurrency.
- Nothing in a lesson targets a database or directory the learner did not create in the lab.
- `lessons.json` and `progress.sqlite` are build artifacts; never hand-edit.
- Lesson `code` uses `String.raw` template
  `code\`...\``so backslash psql commands survive; never
  put backticks or`${` inside it.
- The harness needs bounded `\watch` (`\watch i=1 c=3`) and `-- Session B (blocks ...)` headers for
  statements that wait on another session.

## Resume checklist

1. `cd /root/Software/skills-tools && git status && git log --oneline | head` (all verified modules
   and this file are committed and pushed after each batch; on a new machine clone the repo to
   /root/Software/skills-tools, install Deno 2 and PostgreSQL 16 + contrib, and rebuild the lab per
   "The lab" before validating anything).
2. `cd curriculum-tools && /root/.deno/bin/deno task check && /root/.deno/bin/deno task test`.
3. `su - postgres -c 'pg_isready -h /tmp -p 5440'`; if down, first try
   `su - postgres -c 'export PATH=/usr/lib/postgresql/16/bin:$PATH; pg_ctl -D $HOME/pglab/primary -l $HOME/pglab/primary.log start -w'`
   (a crash lesson may have left it stopped); rebuild per "The lab" only if that fails.
4. Read the status table; if a module is IN PROGRESS, check whether its `curriculum/NN-*.ts` is more
   than the 9-line stub and whether it builds; finish/validate it before the next one.
5. Remaining serial order: 07 -> 08 -> 13 -> 14 -> 09 -> 15, then "Ship".
6. After each verified module: update the status table here, then
   `git add curriculum-tools && git commit && git push`.
