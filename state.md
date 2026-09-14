# DuckDB batch 1–5

Objective: implement and validate the first five lessons of DuckDB outline revision 3.
User instruction (2026-09-14): “do first batch of 5 for duckdb course”; this authorizes the
first slice of the current route. No delegation requested; primary owns all batch work.
Delete this log only after implementation, validation, cleanup and knowledge-store reflection.

## Ownership and baseline

Own `curriculum-tools/courses/duckdb/`, this log, DuckDB availability in the canonical route
and indexes, and the shared tutor skill's course listing. Preserve pre-existing edits to
AUTHORING.md, roadmap.json, tutor.sqlite, docs/README.md, learner/profile research,
future-courses/README.md, and untracked duckdbresearch.md, future-courses/duckdb/, report.md.
Stage only batch changes; preserve the untracked canonical route as the required source for this
course, recording its existing revision rather than revising its scope.

2026-09-14 baseline: root 142 GiB free, 7.1 GiB available RAM, 2% inodes used; /tmp 9.1 MiB.
Learner endpoint /tmp:5440 responds with data_directory=/labs/pglab/primary, recovery=false.
Learner tree 353 MiB; host process inspection identified existing PostgreSQL and active tmux/Codex.
Progress SHA256: 161a9d32039fb889c213668d9751f2a3f2ecdb6615e2b45e922400e6d38dc4fe.
Peak budget: under 500 MiB per serial trial (one PostgreSQL cluster, tiny files, outputs);
under 200 MiB retained pinned tools. No backups/replicas needed. Preserve all unrelated labs.

## Design

1. Read-only PostgreSQL attachment: choose source catalog/schema; compare IDs/totals with psql;
   wrong schema yields a different bounded result. Private PostgreSQL fixture; stop/remove it.
2. Source-side bounded extraction: choose projection/date predicate; local rows stay stale after
   a supplied source insert and change on refresh. Same private fixture lifecycle.
3. SQLite attachment: discover catalog/table and qualify a regional query; native sqlite3
   reconciliation and unchanged source bytes. Only synthetic file; remove owned directory.
4. SQLite types: reproduce mixed-storage scan failure, preserve raw text and complete conversion;
   partition accepted/rejected rows without dropping invalid records. Remove owned files.
5. CSV query: choose date/status predicates, verify count and integer-cent total; a broader
   predicate produces the wrong answer. Remove owned file.
Each lesson supplies setup/control/cleanup, a related syntax example, 3–5 minute learner task,
worked answer and observed interpretation; core target 10–12 minutes.

## Events / remaining work

- 2026-09-14: boundary trials rejected DuckDB writes to both attachments and native reader writes;
  source row counts preserved and both final labs removed. Final learner endpoint responds with
  the original /labs/pglab/primary; no batch process remains. Root 142 GiB free, 2% inodes,
  6.8 GiB RAM available. Progress hash unchanged and WAL empty. All five CLI lesson renders,
  copy-adoption/progress checks, shell syntax and Go vet passed.
- 2026-09-14 required reflection completed: KB search 33 found no DuckDB entry; added and reread
  `data/duckdb-course-tools.md`. Recorded useful feedback on search 32 rank 1. Course-specific
  findings remain in repository knowledge; results compacted to latest accepted trial blocks.
  Remaining: final documentation/acceptance commit, remove only owned scratch files, delete
  this log and commit its removal. Retain installed 133 MiB tools for learner use.
- 2026-09-14 acceptance: final validator exits successfully. All independent variants plus
  shared starters and worked sequence accepted; every named fixture absent after cleanup.
  Shared skill source updated through its existing symlinks. Durable connector/CSV/presentation
  findings recorded in docs/knowledge/duckdb-course.md. Remaining: final boundary/readiness
  checks, evidence report/commits, knowledge-store reflection and any warranted update,
  remove scratch files, then delete this log.
- 2026-09-14: all 15 independent starter/answer/wrong-choice experiments passed. Shared starter
  and worked sequence each completed 5/5 with correct data; final comparison needed to strip
  the shared renderer's `[A]` prefixes. Review also found lesson 1 catalog inspection too broad;
  restricted it to public/sales. Revalidate lesson 1 plus shared sequence for this command change.
  Progress-copy adoption adds 5 lessons while preserving all 39 progress and 40 attempt rows;
  existing 261 lesson identities preserved. The real shared DB remains uninitialized for DuckDB
  intentionally: authoring does not refresh it. Installed tutor/skills symlinks check cleanly.
- 2026-09-14: committed authored course, pinned fixtures, route and in-progress validator as
  cd18aac. Re-run passed lessons 1–3 in all variants. Lesson 4 SQL also produced the intended
  2 accepted/3500 and 3 rejected, but validator expected blank CSV NULL rather than 1.5.5's
  literal NULL. Corrected this comparison and resume at 4; accepted earlier trials need no rerun.
  Isolated route/init/render/done/skip work. Smoke invocation corrected to `undone 2` (verb-first)
  and absolute source DB path because the launcher changes cwd to curriculum-tools.
- 2026-09-14 validation checkpoint: lessons 1–2 starter/answer/wrong-choice trials passed.
  Lesson 3's native sqlite3 CSV uses CRLF while DuckDB CSV uses LF; the first validator comparison
  rejected equivalent rows. Normalize line endings in captured evidence, then resume validation.
  All completed trial fixtures were removed; this is a harness comparison fix, not a SQL change.
- 2026-09-14: all five complete lessons authored; `bin/tutor duckdb check` passes (5 lessons).
  Probed source-side postgres_query and SQLite mismatch/text conversion on 1.5.5; probe
  PostgreSQL and SQLite trees removed. Installed tools occupy 133 MiB, kept for learner use.
  Added Go validator deriving exact starters, displayed SQL answers, wrong choices and cleanup
  from the lesson files. First sandbox run could not chown; its partial lab was removed.
  Host-authorized validation is running serially; completed early PostgreSQL cases match expected
  rows and each fixture is stopped/removed immediately (about 40 MiB per fixture).
- 2026-09-14: user explicitly reiterated keeping this log throughout, doing the final
  /update-knowledge-store reflection, and deleting it at completion.
- 2026-09-14: installed DuckDB 1.5.5 d8cdaa33fd into ignored .cache/duckdb-1.5.5;
  successfully loaded postgres_scanner 41223e5 and sqlite_scanner f79b1db. No global CLI changed.
  Fixture helpers own one mktemp tree, private socket only, reader role, and normal teardown.
- 2026-09-14: user selected DuckDB **1.5.5**; supersedes proposed 1.4.5 before any install.
  Official release metadata supplies compressed CLI SHA256
  c61f21485e6e41d3a0c28ce9904ea18346309cf427b4cf9479bc3564348dc885.
- 2026-09-14: read route/workflow/skills/context; no DuckDB CLI installed. Network and protected
  host checks require sandbox escalation. Knowledge search 32 found existing authoring guidance.
- Remaining: pin/install CLI/extensions; scaffold; author lessons and finite fixture helpers;
  validate starters/answers/wrong choices independently and in sequence; CLI progress smoke;
  record evidence/availability; chunk commits; cleanup/readiness; KB reflection; delete log.
