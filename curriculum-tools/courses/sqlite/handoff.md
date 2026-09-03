# SQLite course review fixes: working handoff

Started 2026-09-03. Review of the 48-lesson SQLite Systems course found the issues below. This file
tracks what is fixed, validated, and committed so work can resume from scratch. Delete it when the
list is complete and everything is pushed.

Rules for this work:

- Only touch `curriculum-tools/courses/sqlite/**`. Unrelated `courses/linux` changes in the working
  tree belong to another session; never stage them (`git add curriculum-tools/courses/sqlite`).
- After editing lessons: `cd curriculum-tools && deno task build sqlite && deno task check`, then
  validate the changed lessons with a fresh disposable lab:
  `mkdir -p /tmp/sqlite-fix-XX && TUTOR_SQLITE_DB=/tmp/sqlite-fix-XX/lab.db deno run -A tools/validate.ts sqlite <slug...>`
  (tool lessons only; shell lessons run manually with `bash` and the same `TUTOR_SQLITE_DB`).
  Compare real output against `expectedResult`; a timeout-free run alone is not a pass.
- Deno: `/root/.deno/bin/deno`. SQLite on this host: 3.45.1, has dbstat, no sqlite_dbpage (so
  `.recover` fails).
- Commit and push after each chunk. Commit message prefix `sqlite:`.

## Findings and status

Legend: [ ] open, [x] fixed + validated + committed.

### Bugs

- [ ] 1. `recover-damaged-copy` zeroes fixed offset 4096; at the lab's 1024-byte pages that is a
      free page, so integrity_check says ok and nothing is corrupted. Compute the offset from
      rootpage and page_size. (Being redesigned together with 11.)
- [ ] 2. `deferred-write-race` claims busy_timeout bounds the wait; SQLite returns SQLITE_BUSY
      immediately (deadlock avoidance) when a reader-with-open-txn upgrades while another holds
      RESERVED. Rewrite to show the 0 ms return with `.timer on` and teach the rule. Mention the same
      immediate return in `busy-snapshot-upgrade`.
- [ ] 3. `busy-timeout-bounds-wait`: `.shell sleep 0.4` is dead, challenge is wrong, success path
      missing. Redesign with a background holder so B succeeds with a long timeout and fails with a
      short one.
- [ ] 4. `measure-the-writer-envelope`: holder 3 s vs racer `timeout 2` means every attempt is busy
      and the racer is killed. Holder 1 s / racer timeout 5 s; fix expected result and caution.
- [ ] 5. Module 1 lesson 4 and all module 2 setups must force `PRAGMA journal_mode=DELETE`
      (page_size is ignored in WAL; main-file cp/stat is wrong in WAL).
- [ ] 6. Setups that switch WAL->DELETE (`unsafe-live-copy`, `vacuum-into-snapshot`,
      `recover-damaged-copy`, module 4) fail with "database is locked" if any other session is open.
      Setups print the resulting mode; SKILL.md coaches closing other sessions before setup.

### Learner traps

- [ ] 7. SKILL.md never says how to open a session (`export TUTOR_SQLITE_DB=...; sqlite3
      "$TUTOR_SQLITE_DB"` per terminal, or `bin/sqlite-repl`). Add it.
- [ ] 8. `rollback-reader-writer-blocking`: B's COMMIT `.timeout 2000` gives a human two seconds;
      a failed COMMIT leaves B's txn open. Raise to 30000 and say so.
- [ ] 9. `decode-database-header`: `.open :memory:` strands the REPL; drop it.
- [ ] 10. `journal-modes` leaves PERSIST plus a stale journal; reset to DELETE at the end.

### Weak lessons

- [ ] 11. Recovery lessons (`recover-damaged-copy`, capstone recovery section) document that
      salvage yields nothing on this build. Redesign to show real partial salvage without
      `.recover`: corrupt a non-root leaf of a multi-page table; key-range probes return rows from
      intact leaves while a full scan fails. Keep `.recover` as an optional path.
- [ ] 12. `durable-job-claims`: two sessions, no overlap. Make it a real bounded contention demo
      (A claims without COMMIT, B's BEGIN IMMEDIATE times out, A commits, B claims job 2).
- [ ] 13. `online-cli-backup` challenge repeats the lesson; replace.
- [ ] 14. `immediate-reserves-writer` prints "B entered" after B failed; relabel.

### Minor

- [ ] 15. Double-quoted string literals in `offline-agent-capstone` and
      `sqlite-architecture-decision` scripts; use single quotes.
- [ ] 16. Capstone crash pipeline `sleep 5` after `timeout 1`; use `sleep 2`.

## Commit log

- (none yet)
