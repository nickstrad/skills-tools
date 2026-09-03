# SQLite Systems implementation handoff

Last updated: 2026-09-03 UTC

## Objective and boundaries

Implement every requirement in `PLAN.md` for the SQLite course. Keep work under
`curriculum-tools/courses/sqlite/` unless validation demonstrates a defect in the generic tutor
engine. Do not modify or include the concurrent PostgreSQL work in SQLite commits.

Every item moves to **complete** only after an improve/correct pass, relevant runtime validation,
and a scoped git commit that includes this handoff file.

## Completed

- Checkpoint `dbac358` records this plan/handoff and the safe SQLite REPL wrapper/config.
- Course-local REPL wrapper at `bin/sqlite-repl`:
  - opens the database selected by `TUTOR_SQLITE_DB`;
  - requires an absolute path to a `.db` below a writable existing directory;
  - rejects empty, relative, root-level, symbolic-link, and non-regular-file targets;
  - is selected by `course.json`.
  - validation: accepted a unique `/tmp/.../valid.db`; rejected unset, relative, `/danger.db`, and
    symlink paths with the expected nonzero exits. `sh -n` and Deno formatting passed.
- The implementation plan is recorded in `PLAN.md`.
- Validation-harness timeout cleanup:
  - `tools/validate.ts` now cancels a successful step's pending timeout and removes a timed-out
    waiter;
  - this was a demonstrated engine defect: one successful SQLite lesson printed completion but the
    process remained alive for 30.19 seconds;
  - after the fix the same real lesson exits in 0.33 seconds;
  - `deno check tools/validate.ts` and all 9 `deno task test` tests pass.
- Modules 04-06 (17 lessons: concurrency, WAL, backup/recovery) completed their author correction
  and independent review passes:
  - all safe lessons passed the harness against fresh databases, including deferred/immediate lock
    races, busy timeouts, compare-and-swap, idempotency, WAL snapshots, checkpoint starvation,
    online backup, `VACUUM INTO`, foreign-key/integrity triage, and recovery;
  - dangerous live-copy lesson 30 proved the main-file-only copy remained at one committed row while
    the WAL-backed source reached two rows;
  - damaged-copy lesson 34 now records the advertised-but-unavailable `.recover` capability
    (`sqlite_dbpage` is missing), falls back to partial `.dump` salvage, and validates both the
    recovered copy and unchanged source;
  - final `deno fmt --check`, `deno check`, and `git diff --check` pass on the three module files.
  - checkpoint `51fc797` records these modules and this handoff state.
- Modules 01-03 (16 lessons: lab/file, pages, rollback journals) completed author correction,
  independent review, and main-agent validation:
  - safe lessons 2-13 passed 12/12 through the harness against a fresh database; corrected evidence
    includes a 4096-byte decoded page size, labeled cross-session counts, lesson-owned `dbstat`
    output, and two retained rows under each DELETE, TRUNCATE, and PERSIST journal mode;
  - dangerous lessons 14-15 proved a genuine hot journal: 499 dirty rows were present in the main
    file before termination, the journal began with magic `d9d505f920a163d7`, reopening returned
    `integrity_check=ok`, 500 committed rows, zero dirty rows, and removed the recovered journal;
  - the recovery audit was tightened after main-agent review to report short payload prefixes rather
    than printing multi-kilobyte values.
  - checkpoint `9510e27` records these modules, the formatted plan, and this handoff state.
- Modules 07-09 (15 lessons: performance, local systems, capstones) completed author correction,
  independent review, and main-agent validation:
  - the current generated harness completed lessons 35-46 without timeout, executing ten tool
    lessons and correctly routing shell lessons 38 and 44 to manual validation; both shell lessons
    were run separately to verify the bounded writer envelope and idempotent lost-ack transfer;
  - the WAL incident grew its sidecar from 16,512 to 1,277,232 bytes behind a reader, reported the
    expected partial checkpoint relationship, then truncated to zero after reader release;
  - dangerous capstone 47 exited successfully with process termination isolated to its producer,
    duplicate-safe transfer, `90/90` replica convergence, stale-worker fencing, and valid source and
    backup state;
  - this SQLite build lacks `sqlite_dbpage`, so the capstone accurately records `.recover` status 1,
    uses its `.dump` fallback, and validates the resulting empty-but-integral salvage database;
  - final formatting and type checks pass on all three source modules.
  - checkpoint `775ff9c` records these modules and this handoff state.
- Final integration validation is complete:
  - `deno task build sqlite` writes exactly 48 lessons; all 48 planned slugs match in exact order,
    ordinals are consecutive, prerequisites point backward, tag counts and vocabulary are valid,
    multi-session headers are complete, and module counts are `5/6/6/6/6/5/4/7/3`;
  - one fresh-database harness sweep completed lessons 2-46 (`45/45`) without timeout; the four
    reported lock errors are the intentional evidence in lessons 18, 19, 21, and 27;
  - every shell/dangerous path was also validated serially, including lab setup, hot-journal crash
    and recovery, `strace` synchronization counts, batching, live-copy failure, damaged-copy
    salvage, the bounded writer envelope, lost-ack delivery, and both capstones;
  - repository-wide `deno task check` passes and `deno task test` reports 9 passed, 0 failed;
  - an isolated SQLite tutor database passed init, modules, topics, pretty, search, done, note,
    skip, undone, status, and revision-staleness behavior;
  - the skill-creator quick validator reports `courses/sqlite/skill/sqlite-tutor` is valid.

## In progress

- Commit the validated final topology: delete placeholder `curriculum/01-lab.ts`, register all nine
  modules in `curriculum/mod.ts`, and commit the generated `lessons.json` with this handoff.
- After that checkpoint, record its hash here, mark the project complete, and push the branch.

## Environment

- Repository: `/root/Software/skills-tools`
- Tutor root: `/root/Software/skills-tools/curriculum-tools`
- Deno: `/root/.deno/bin/deno` (not currently on `PATH`)
- SQLite: `3.45.1`
- Observed capabilities: `ENABLE_DBSTAT_VTAB`, `.backup`, `.recover`, `strace`, and `xxd`
- Existing unrelated dirty work includes PostgreSQL curriculum and top-level script changes. Never
  stage with broad commands such as `git add .`; stage explicit SQLite paths only.

## Resume procedure

1. Read this file, `PLAN.md`, `../../docs/AUTHORING.md`, and `../../docs/VALIDATION.md`.
2. Run `git status --short` and preserve all non-SQLite changes.
3. All authoring and validation streams are complete. Finish only the two integration steps listed
   under **In progress**, preserving unrelated work.
