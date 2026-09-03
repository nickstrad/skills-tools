# Findings from the 96-lesson metadata retrofit

Recorded 2026-09-03 after the PostgreSQL course's reading and syntax metadata
was rewritten and centrally audited. Use this alongside `lesson-writeup-spec.md`
when revising the course.

## Coverage and citation decisions

- `reading-map.md` contains 64 chapter-cited lessons and 32 honest "not covered"
  lessons. Lesson 1 is the one reviewed exception: although the original map
  called installation out of scope, Chapter 1 directly explains the directory
  and process model that `initdb` and `pg_ctl` create. The final course
  therefore has 65 lessons with `readingNotes` and 31 without them.
- Modules 09 and 10 are not covered by the book. Do not turn Chapter 11's short
  description of `wal_level = replica` and `logical` into a claim that the book
  teaches streaming or logical replication. The live lessons are the primary
  explanation there.
- The backup, PITR, and timeline lessons in module 08 are also not covered.
  Chapter 10 is background for WAL positions and recovery, not a source for
  `pg_basebackup`, archives, recovery targets, or timeline operations.
- The strongest direct overlaps are Chapters 3–8 for pages, MVCC, vacuum, and
  freezing; Chapters 2 and 12–14 for isolation and locks; Chapters 10–11 for
  WAL/checkpoints; Chapters 16–23 for plans; and Chapter 25 for B-tree page
  structure.
- PostgreSQL 16 views and extensions that postdate or fall outside the
  PostgreSQL 14 book must be described as lesson additions. Examples include
  `pg_stat_io`, `pg_walinspect`, `pg_stat_statements`, replication slots, and
  the logical-replication catalogs.

## Writing findings from the module agents

- Explain invariants rather than promising unstable numbers. Process labels,
  cache counters, HOT counts, free-space-map bytes, LSNs, PIDs, timings, and WAL
  volume vary by version and run; tell the learner what relationship or
  transition to look for.
- Distinguish approximate statistics from exact inspection. In particular,
  `pg_stat_user_tables.n_dead_tup` is an estimate, while `pgstattuple` scans the
  relation; visibility map bits connect directly to `EXPLAIN`'s `Heap Fetches`
  evidence.
- The book often explains a mechanism without the operational view used by the
  course. The lock and isolation lessons add live `pg_stat_activity`,
  `pg_locks`, `pgrowlocks`, wait queues, timeouts, SQLSTATEs, and retry
  behavior. Say which evidence comes from the experiment rather than implying it
  appears in the chapter.
- Command-heavy shell lessons need the same teaching structure as SQL lessons.
  Dangerous targets, substituted paths, ports, LSNs, timelines, and flags must
  say where their values come from and what failure looks like.

## Integration findings

The first delegated drafts proved that headings alone are not a sufficient
quality check. Several WAL, recovery, and replication drafts named every command
but initially omitted the explicit "What it gives us" evidence. They were
refactored so every top-level Piece-by-piece item now says what it is, what it
does in this experiment, and how its output proves the lesson.

The final static audit verifies all 96 citations, the presence and order of all
three learning headings, the covered/not-covered `readingNotes` rule, a
non-trivial prose floor, and evidence lines for named items. A separate
comparison against Git `HEAD` ignores only `reading`, `readingNotes`, and
`syntaxBreakdown`; it found no changed experiment fields, with the intentional
exception of the previously reviewed lesson 1 caution expansion.
