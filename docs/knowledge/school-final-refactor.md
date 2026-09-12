# Remaining course refactorings completed

Verified 2026-09-12. Nick authorized removing the remaining reading schema, consolidating
systemscoach lesson files, inlining Essentials context, pruning gRPC artifacts and archiving
superseded material. This completes the follow-up to [the first cleanup](course-workflow-cleanup.md).

## Final structure

- Active curricula, types, generated catalogs and lesson database schemas have no `reading`,
  `readingNotes` or `studyCheckpoint` fields. Their original catalog values are preserved by
  course/slug in [the legacy archive](../../archive/legacy-reading/README.md). Database-specific
  exports preserve raw values, including inactive lessons, in ignored local archive files.
- `tutor <course> migrate` exports those values and drops only their columns in a transaction.
  It does not seed a catalog. Restoration on copies is explicit and rolls back on an identity
  mismatch. Fresh initialization never creates those retired fields.
- All 26 Essentials lessons contain their own diagrams and terminal guidance. The source helper
  and unused visual exports are removed. Every other generated field is exactly unchanged.
- Seven systemscoach interpretation files are merged into `lesson.md`; the old file reader is
  removed. The saved `review` command remains an alias. Project availability, lesson revisions,
  experiments and receipts remain unchanged. See the
  [source transformation record](../../systems-projects/projects/cursor-git/validation/source-layout-migration-20260912.md).
- Thirty-six superseded plans, design documents and prototype guides moved under
  [archive/course-history](../../archive/README.md). Their content is unchanged except rebased
  Markdown links and source imports. Current plans, runnable reference curricula, progress,
  validation records and the active systemscoach handoff remain in place.

## Review and preservation evidence

Three Luna/high agents handled reading migration, systemscoach consolidation, and Essentials
inlining followed by archive organization. The primary inspected their changes and independently
verified results. Review caught an omitted systemscoach limitations paragraph, newline differences
and historical hashes being confused with immediate-before hashes; these were corrected before
committing. The primary finished the small systemscoach corrections and integration directly.
Terra/high independently reviewed the database migration and found no blockers.

- Final Deno formatting, lint and type checks passed; **38 tests passed**. All five catalogs built.
- Independent comparison against `df6211c` confirms all 250 generated lesson objects are unchanged
  except removal of the three retired metadata fields. Every removed source value matches its
  archived value. Essentials diagram/context text is identical after inlining.
- Terra verified all five SQLite backup copies, including inactive PostgreSQL lessons and SQLite's
  older two-column reading schema. Raw exports, nonlegacy rows, progress and attempts matched;
  restoration reconstructed all removed values. An induced identity failure rolled back restoration,
  differing archive replacement was rejected, and lesson display preserved the database.
- The primary applied schema-only migration to all five live progress databases, comparing every
  remaining lesson field and history table and every archived value. Integrity and foreign-key
  checks passed. The [application report](school-final-refactor-migration.json) records counts and
  local archive locations without learner notes. PostgreSQL retained 99 stored rows, including
  retired history; SQLite retained its existing 48 rows rather than being refreshed to 54.
  Essentials retained **22 progress rows and 23 attempts**.
- Go tests and vet passed. Separately built old/new CLIs produced byte-identical output for all
  three available systemscoach lessons and their aliases, with isolated state remaining empty.
  All seven merged source bodies match the exact former renderer concatenation. All 13 current
  source-manifest entries verify; old accepted hashes remain explicitly historical.
- All 36 archive moves passed independent content comparison; local links and archived guide
  imports resolve. The 85 retained PostgreSQL guides remain importable reference source.
- Installed launcher/skill checks pass all 15 links. No new course or experiment was authored;
  original SQL, object-store, Linux and gRPC experiment suites were not rerun for these source and
  schema transformations.

## gRPC pruning and learner readiness

Removed ignored gRPC `.tools/`, `lab/bin/` and `lab/generated/` after checking tracked-file ownership
and active process executables/working directories. This reclaimed **796,069,888 allocated bytes**
(about 759 MiB) from that course. Source, installer, validation and progress remain. The course is
marked reference; executing its experiments again requires reinstalling its tools.

Systemscoach had borrowed gRPC's Go installation. Go 1.26.8 now lives separately at `/usr/local/go`,
installed from the same digest-verified release with `/usr/local/bin/go` and `gofmt` links. Its
launcher, supplied-client builder and shell profile use the shared installation and discard only
the retired course's inherited cache paths. Minimal-PATH launcher and builder checks passed,
including deliberately supplied stale cache variables. The disposable builder binary was removed.
The shared Go runtime and useful systemscoach compilation cache remain; the course-local figure
above is gross reclamation, not net host savings.

Owned audit backups, test binaries and temporary fixtures were removed after acceptance. The small
ignored metadata exports remain intentionally for original-data recovery. No PostgreSQL validation
cluster was allocated or stopped. The learner's existing `/labs/pglab/primary` continues to answer
read-only queries on `/tmp:5440`. Root has about **16 GiB free**. Root `state.md` remains the only
intentional uncommitted file and records this final state.
