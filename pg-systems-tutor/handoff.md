# Project handoff

> Historical development note preserved from the original droplet. The checked-in code, tests, and
> current README are authoritative if this note describes a different intermediate state.

Last updated: 2026-09-02 (UTC)

## Goal

Finish the PostgreSQL systems tutor in two phases:

1. Finish and fully verify the CLI.
2. Then finish and validate the Codex skill wrapper.

The CLI stores 100 PostgreSQL systems lessons and user progress in SQLite. The skill must use the
CLI as its only interface to curriculum content and progress.

## Current state

Baseline before this work:

- `deno task check` passed.
- `deno task test` passed with 2 tests.
- The default database was initialized with 100 lessons and no recorded progress.
- No skill files had been edited during this work yet.

CLI changes made so far in `src/main.ts`:

- Added CLI version `1.0.0` and `pgtutor --version`.
- Added command-specific option and positional-argument validation.
- Unknown commands now fail before opening or creating a SQLite database.
- Conflicting `list` modes (`--todo`, `--done`, `--all`) are rejected.
- Expanded curriculum seed validation for slugs, required fields, enum values, versions, estimates,
  revisions, and duplicate prerequisites.
- Made progress and attempt writes for `done`/`skip` atomic.
- Changed `undone` to preserve an existing lesson note while clearing completion fields.
- Fixed `list --todo` so skipped lessons are excluded, matching `next` behavior.
- Fixed `status.todo` so skipped lessons are not counted as todo.

Launcher change made in `bin/pgtutor`:

- It now uses `DENO_BIN` when supplied, otherwise searches `PATH`, otherwise falls back to
  `/root/.deno/bin/deno`, and emits a clear error if Deno is unavailable.

Test changes made in `tests/main_test.ts`:

- Added coverage for skip/todo/next semantics.
- Added note preservation and idempotent reseeding coverage.
- Added stale-revision selection coverage.
- Added search and category-filter coverage.
- Added invalid-command/option validation and no-database-side-effect coverage.
- Added version coverage.

## CLI phase: complete

The finalized CLI contract is documented in `README.md`. Verification completed successfully:

```sh
/root/.deno/bin/deno task check
/root/.deno/bin/deno task test
```

Results:

- Formatting, lint, and type checks pass.
- All 9 tests pass.
- `bin/pgtutor` was exercised end to end against an isolated database: init, show with caution, done
  with a note, next, status, and multi-term search all behaved correctly.
- Multi-term search now requires each whitespace-separated term to match somewhere across the
  lesson's searchable fields; `search "replication lag"` returns the expected lessons.
- The default database remains unchanged at 0 done, 100 todo, and 0 skipped.
- Root `README.md` now documents setup, commands, state semantics, safety, and development checks.

## Skill phase: complete

Updated `skill/pg-systems-tutor/SKILL.md` to match the finalized CLI:

- The CLI is the only interface to curriculum and progress data.
- Search and list requests use compact output, then fetch structured lesson details only when
  needed.
- Initialization is retried only for the explicit uninitialized-database error.
- Lesson display is kept separate from PostgreSQL execution and progress mutation.
- Authored cautions and known server-version incompatibilities are surfaced.
- Course completion, ambiguous pronouns, explicit mutations, and note preservation are handled.

`agents/openai.yaml` already matched the skill and needed no change.

Validation completed successfully:

```sh
python3 /root/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  skill/pg-systems-tutor
```

Result: `Skill is valid!`

Realistic workflows were exercised against an isolated database:

- `next --json` on an uninitialized database returned the expected initialization error; `init` and
  retry then returned lesson 1.
- Explicitly marking lesson 1 done with a multiword note succeeded; status became 1 done / 99 todo.

Final repository verification:

- `deno task check` passes.
- `deno task test` passes: 9 passed, 0 failed.
- The default database remains 0 done / 100 todo / 0 skipped.

## Resume status

The requested project work is complete. No known implementation or validation work remains. The
skill bundle is ready at `skill/pg-systems-tutor`; installation into a user's Codex skills directory
was not requested and was not performed.

## Important files

- `src/main.ts` — CLI, schema, migrations, seeding, and progress logic.
- `data/lessons.json` — authoritative 100-lesson curriculum.
- `data/pg-systems-tutor.sqlite` — default user-progress database.
- `bin/pgtutor` — portable launcher.
- `tests/main_test.ts` — Deno tests.
- `skill/pg-systems-tutor/SKILL.md` — skill instructions.
- `skill/pg-systems-tutor/agents/openai.yaml` — skill UI/invocation metadata.

## Constraints and decisions

- User explicitly requested CLI completion before skill work.
- Preserve user progress. `init` is an idempotent curriculum refresh and must not erase progress.
- Showing a lesson never marks it complete.
- Completion, skip, and undo require explicit user intent when driven by the skill.
- Use `apply_patch` for edits.
