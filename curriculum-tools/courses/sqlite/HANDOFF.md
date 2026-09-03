# SQLite Systems implementation handoff

Last updated: 2026-09-03 UTC

## Objective and boundaries

Implement every requirement in `PLAN.md` for the SQLite course. Keep work under
`curriculum-tools/courses/sqlite/` unless validation demonstrates a defect in the generic tutor
engine. Do not modify or include the concurrent PostgreSQL work in SQLite commits.

Every item moves to **complete** only after an improve/correct pass, relevant runtime validation,
and a scoped git commit that includes this handoff file.

## Completed

- Course-local REPL wrapper at `bin/sqlite-repl`:
  - opens the database selected by `TUTOR_SQLITE_DB`;
  - requires an absolute path to a `.db` below a writable existing directory;
  - rejects empty, relative, root-level, symbolic-link, and non-regular-file targets;
  - is selected by `course.json`.
  - validation: accepted a unique `/tmp/.../valid.db`; rejected unset, relative, `/danger.db`, and
    symlink paths with the expected nonzero exits. `sh -n` and Deno formatting passed.
- The implementation plan is recorded in `PLAN.md`.

## In progress

- Luna/high authoring stream: modules 01-03 (`01-lab-file.ts`, `02-pages.ts`, `03-journals.ts`).
- Luna/high authoring stream: modules 04-06 (`04-concurrency.ts`, `05-wal.ts`, `06-recovery.ts`).
- Luna/high authoring stream: modules 07-09 (`07-performance.ts`, `08-local-systems.ts`,
  `09-capstone.ts`).
- Nine-file module topology and `curriculum/mod.ts` registration exist in the working tree but are
  not complete or committed yet because the lesson batches are still being authored.
- Main-agent integration review has already required:
  - all tool sessions use the wrapper-opened `TUTOR_SQLITE_DB`, never hard-coded `/tmp` or
    repository-relative database paths;
  - derived copies/sidecars remain siblings beneath the selected scratch database directory;
  - `(blocks` appears only when the validation harness should send a step asynchronously;
  - expected results match observed SQLite 3.45.1 output rather than merely asserting no timeout.

## Validation still required

1. Confirm all 48 planned slugs, ordering, prerequisites, tags, safety levels, sessions, and run
   locations after `deno task build sqlite`.
2. Run `deno task check` and `deno task test` without changing concurrent PostgreSQL files.
3. Run each tool lesson through `tools/validate.ts` with its own fresh absolute `TUTOR_SQLITE_DB`;
   inspect output for unexpected parse, shell, busy, and capability errors.
4. Run shell, crash, copy, `strace`, corruption, and recovery exercises manually and serially.
5. Independently rerun at least two lessons per module, every multi-session lesson, every dangerous
   lesson, and all capstones; compare evidence line by line with `expectedResult`.
6. Smoke-test `bin/tutor sqlite` init/modules/topics/pretty/search, isolated `--db` progress,
   completion, notes, skip/undone, and revision staleness.
7. Validate the existing `skill/sqlite-tutor` package with the skill validator; update it only if
   actual usage exposes a gap.

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
3. Inspect agent status or the nine curriculum files; do not assume an authoring stream finished
   until its report and validation evidence exist.
4. Continue from the first incomplete validation item above, updating and committing this handoff
   with every completed slice.
