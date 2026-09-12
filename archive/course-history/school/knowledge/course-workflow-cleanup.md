# Course workflow cleanup acceptance

Verified 2026-09-12. The school now follows Markdown route discussion and sign-off, an explicitly
requested implementation batch, and shared `route`, `[NUMBER] lesson`, `NUMBER done` commands.
See [the current architecture](../../../../docs/knowledge/concise-course-cli.md) for the ongoing contract.

This records the first cleanup checkpoint. A subsequent authorized refactor removes the retained
reading fields and systemscoach review-file reader, inlines Essentials context, archives superseded
material, and prunes gRPC tools. See [the current architecture](../../../../docs/knowledge/concise-course-cli.md) and
[the follow-up acceptance](school-final-refactor.md) for current state.

## Accepted changes

- Discovery labels current courses, retained references and proposed routes, deriving counts from
  catalogs and canonical plans. Essentials has 26 of 40 lessons; proposed SQLite Essentials has
  0 of 32 and Linux v2 has 0 of 44. No replacement course was authored or scaffolded.
- Route and build share canonical Markdown parsing and identity validation. Invalid tables,
  duplicate future IDs and changed stable slugs fail before a catalog is replaced. Historical
  reference plans fall back to their existing catalogs.
- Scaffolding produces an empty neutral shell linked to its canonical plan. It creates no invented
  first lesson, tool-specific REPL, catalog or learner progress; an empty build fails explicitly.
- PostgreSQL wrappers use the shared renderer and route. The old pilot runtime, second route list
  and stage renderers are removed. Saved presentation aliases select one complete lesson.
  Original guide notes and curricula remain reusable references.
- The initial 26 Essentials lessons retain their former wrapper diagrams, connection instructions
  and cleanup guidance in authored context. The experiment fields and stable identities did not
  change. New batches supply their own context directly.
- The unused bundled PostgreSQL book, its mapping/authoring docs and course symlink are removed.
  Courses no longer display reading citations or checkpoints. Legacy source metadata stays inert
  in original catalogs and structured exports to preserve data. Technical research notes remain
  author inputs; separate reading is outside the course workflow.
- The obsolete `pgtutor` launcher is retired. Canonical `tutor`, `pgcoach`, `systemscoach` links and
  six skill links for both Codex and Claude pass the installation check. The installer compares
  copies before replacing them and preserves conflicting or unrelated paths.
- Current planning, batch and authoring instructions have separate authorities. Historical plans
  explicitly preserve earlier model assignments as provenance. Systemscoach retains its separate
  Go engine and existing review-file reader; its new-review template is removed, so new lessons
  include their interpretation directly in `lesson.md`.

## Independent review and checks

Nick requested Luna with high reasoning. Three subagents handled shared engine/scaffolding,
PostgreSQL consolidation and documentation. The primary reviewed their submissions before committing
them and requested corrections for canonical-table parsing, duplicate plan detection, failed-build
preservation, wrapper defaults and malformed options, quoted database paths, stale completions and
all-lesson context preservation. The primary also integrated discovery, installation, retired
reading output and final documentation, and rejected malformed trailing table rows.

- `deno task check`: formatting, lint and type checks passed.
- `deno task test`: **39 passed, 0 failed**, including shared progress/identity behavior, all
  Essentials lesson views, reference aliases, discovery and scaffold/build failure boundaries.
  Retiring pilot-specific tests changes the count from the earlier baseline suite.
- `deno task build`: all five catalogs built successfully. Independent comparison with baseline
  `8899e9d` found the gRPC (6), Linux (72), PostgreSQL (92) and SQLite (54) catalog objects unchanged.
  All 26 Essentials lessons changed only `syntaxBreakdown`; their prior explanations remain in
  order around the inserted context. Setup, code, expected results, safety, sessions, slugs,
  revisions and other fields are unchanged.
- Installed CLI checks confirmed Essentials 26/40, proposed SQLite 0/32 and Linux 0/44, using
  nonexistent temporary database paths. Route display created no databases.
- `go test ./...` and `go vet ./...` in `systems-projects` passed.
- `python3 scripts/school-links_test.py`: **4 passed**; `school-links.py --check` passed all 15 links.

These are tooling and presentation checks. Existing SQL/Linux/gRPC experiments were not rerun;
their unchanged experiment fields retain their prior validation records.

## Progress and resource acceptance

The reviewed [refresh script](../../../../archive/deno-engine/curriculum-tools/courses/postgres-essentials/validation/refresh.py)
first refreshed a SQLite backup and checked all 26 lessons through six presentation aliases. Only
then did it refresh live Essentials metadata and repeat those checks. The
[machine-readable report](../../../../curriculum-tools/courses/postgres-essentials/validation/workflow-cleanup-progress.json)
records unchanged logical history: **22 progress rows, 23 attempts**, and lesson 23 remains next.
This refreshed lesson metadata, not completion. The temporary backup was removed.

Original PostgreSQL, SQLite, Linux and gRPC progress database hashes matched the initial audit;
the original PostgreSQL WAL hash also matched. The learner postmaster PID 348739 still serves
`/labs/pglab/primary` on `/tmp:5440`; a read-only `SHOW data_directory` succeeded. No PostgreSQL
validation cluster was allocated. Owned audit scratch and disposable test copies are removed.
Final resources: about **15 GiB free**, **6.7 GiB memory available**, and **7% inode use**. The useful
gRPC toolchain/cache remains because this task found no disk pressure requiring its removal.

Root `state.md` is the user-requested local findings/backlog and is deliberately excluded from
commits. Canonical validation evidence lives in this indexed record instead.
