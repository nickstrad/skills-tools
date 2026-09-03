# SQLite course review fixes: working handoff

Started 2026-09-03. A review of the 48-lesson SQLite Systems course found the issues below. This
file tracks what is fixed, validated, and committed so work can resume from scratch. Delete it when
the list is complete and everything is pushed.

## Rules for this work

- Only touch `curriculum-tools/courses/sqlite/**`. Unrelated `courses/linux` changes in the working
  tree belong to another session; never stage them (use `git add curriculum-tools/courses/sqlite`).
- `deno task check` currently fails on the other session's linux files. Use the scoped equivalent:
  `deno fmt --check courses/sqlite && deno lint courses/sqlite src && deno check courses/sqlite/curriculum/*.ts src/*.ts`.
- After editing lessons: `cd curriculum-tools && deno task build sqlite`, then validate the changed
  lessons with a fresh disposable lab:
  `mkdir -p $DIR && TUTOR_SQLITE_DB=$DIR/lab.db deno run -A tools/validate.ts sqlite <slug...>`.
  Shell lessons are skipped by the harness; extract their code from `lessons.json` and run them with
  `bash` and the same `TUTOR_SQLITE_DB`. Compare real output against `expectedResult`; a
  timeout-free run alone is not a pass.
- The `code` tag is `String.raw`: write `\n` once in a lesson source, never `\\n`. sqlite3's
  `.shell` re-splits its arguments on spaces and re-quotes them, so avoid backslash escapes and
  nested double quotes inside a `.shell` line (use `echo` instead of `printf '...\n'`).
- Deno: `/root/.deno/bin/deno`. SQLite on this host: 3.45.1, has dbstat, no sqlite_dbpage (so
  `.recover` fails).
- Bump a lesson's `revision` when its code or expected result changes materially, so learners who
  completed the old version see it as stale.
- Commit and push after each chunk. Commit message prefix `sqlite:`.

## Findings and status

Status: DONE = fixed, validated on a fresh lab, and committed.

### Bugs

1. DONE `recover-damaged-copy` zeroed fixed offset 4096; at the lab's 1024-byte pages that was a
   free page. Now redesigned (see 11): the damaged page is chosen from dbstat and its offset
   computed from page_size.
2. DONE `deferred-write-race` claimed busy_timeout bounds the wait. SQLite returns SQLITE_BUSY at
   once (deadlock avoidance) when a connection holding a read transaction asks for RESERVED while
   another holds it. Lesson now uses `.timeout 2000` plus `.timer on`, expects `real 0.000`, and
   teaches the rule. `busy-snapshot-upgrade` got the same timer and note.
3. DONE `busy-timeout-bounds-wait` redesigned as one session with a background holder started from
   `.shell`: round 1 waits about 0.4 s and succeeds under a 2 s budget; round 2 fails after 150 ms
   under a 1 s hold; retry succeeds. Old dead `sleep` and wrong challenge removed.
4. DONE `measure-the-writer-envelope`: holder 1 s, racer `timeout 5`, prints busy_attempts plus
   racer_rows (validated 7 busy, 43 rows). Caution no longer claims the holder is terminated.
5. DONE Module 1 lesson 4 and every module 2 setup force `PRAGMA journal_mode=DELETE` first.
   Validated from a WAL lab: page_size takes effect and stat bytes equal page_size times page_count.
6. DONE Setups that switch WAL->DELETE (`unsafe-live-copy`, `vacuum-into-snapshot`,
   `recover-damaged-copy`, module 4 lessons 1-4) print "close every other sqlite3 session first: the
   next line must print delete"; SKILL.md coaches closing sessions before Setup.

### Learner traps

7. DONE SKILL.md has an "Open the lab sessions" section (exports plus `sqlite3 "$TUTOR_SQLITE_DB"`
   per terminal; "the wrapper" explained; close other sessions before Setup).
8. DONE `rollback-reader-writer-blocking`: B's COMMIT timeout is 30 s; caution explains the window
   and that a timed-out COMMIT leaves B's transaction open.
9. DONE `decode-database-header` no longer runs `.open :memory:`.
10. DONE `journal-modes` resets to DELETE at the end and shows the persisted journal is gone.

### Weak lessons

11. DONE `recover-damaged-copy` now inserts 3000 rows, zeroes one non-root leaf chosen from dbstat,
    shows quick_check and a full scan failing, then salvages by 100-row key ranges through ATTACH
    into a recovered file (2900 rows at 1 KiB pages, 2700-2800 at 4 KiB); `.recover` is reported as
    an optional extra. `offline-agent-capstone` no longer pretends to salvage: it detects the
    damaged candidate with integrity_check and restores from the verified backup
    (recovered_tables=4, balance 90).
12. DONE `durable-job-claims` is a real bounded contention demo (B's BEGIN IMMEDIATE fails after 250
    ms, then claims job 2 after A commits).
13. DONE `online-cli-backup` challenge now asks for the rollback-mode variant.
14. DONE `immediate-reserves-writer` label reads "B refused admission, still autocommit".

### Minor

15. DONE Double-quoted SQL string literals replaced with single quotes in both capstone scripts.
16. DONE Capstone crash pipeline sleeps 2 s instead of 5 s.

Revision bumped to 2: decode-database-header, journal-modes, deferred-write-race,
busy-timeout-bounds-wait, busy-snapshot-upgrade, recover-damaged-copy, measure-the-writer-envelope,
durable-job-claims, offline-agent-capstone.

## Validation evidence (2026-09-03)

- Harness, fresh lab: lessons 1-14 (modules 1-3), 18-23 (module 4), 27, 30-34 (module 6), 39-45
  (module 8): all outputs matched expectedResult, no "Error" or "locked" other than the deliberate
  busy failures.
- WAL-start reruns of decode-database-header, pages-and-dbstat, freelist-vacuum-and-reuse: setup
  prints delete, page sizes correct.
- recover-damaged-copy on a 1024-byte-page lab: damaged_leaf_page=4, one unreadable chunk,
  recovered_rows 2900.
- Shell lessons run manually: measure-the-writer-envelope, offline-agent-capstone,
  sqlite-architecture-decision all matched.

## Commit log

- 22eb382 sqlite: add review-fix handoff
- (next) sqlite: fix review findings 1-16 (see this file)
