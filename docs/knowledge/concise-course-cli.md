# Shared concise course CLI

Updated: 2026-09-12. The learner uses `tutor <course> route`, `[NUMBER] lesson`, and `NUMBER done`.
`pgcoach` wraps the same engine for PostgreSQL Essentials. Display never records completion.

## Plan, then implement a bounded batch

The [planning guide](../../future-courses/README.md) owns the persistent Markdown draft, research,
discussion and outline sign-off. The [batch workflow](../lesson-batch-workflow.md) owns execution,
primary review, validation, commits and cleanup. The [authoring guide](../../curriculum-tools/docs/AUTHORING.md)
owns complete lesson content. Do not reconstruct current policy from historical course redesigns.

Future routes live in `future-courses/<folder>/course.md`; existing Essentials keeps `PLAN.md`.
A canonical numbered table fixes titles and stable slugs. Future plans take precedence over their
implementation's plan link. Invalid identities and route/catalog mismatches must fail before a
build replaces the generated catalog. Old reference plans use their catalogs for route display.

The scaffold is an empty runtime-neutral course shell, with a relative link to its planning source
when present. It supplies no invented first lesson, REPL defaults, catalog or progress. Author the
requested batch before building; empty builds fail explicitly. Do not scaffold during discussion.

## Discovery, content and progress

`tutor courses` combines current/reference course metadata with proposed routes and derives
available/total counts. `route` reads existing progress read-only, showing current `[done]`, stale
`[revisit]`, available and planned rows. Planned routes are browsable without initializing progress;
planned lessons cannot be served or completed. New IDs never inherit old reference completion.

Essentials now uses the shared route and lesson renderer. The first 26 lessons' former
wrapper-only diagrams, session setup and safe-stop guidance are now inlined in each lesson’s syntax
context. All batches author complete context directly; no diagram helper or second route list remains.
Saved presentation aliases open the same complete lesson. The reference pilot no longer inserts a
stop gate; original course experiments, data and historical guide notes remain for reuse.

Reading is separate from these courses. The bundled PostgreSQL book and its authoring/mapping
workflow are removed. Lesson output omits citations, reading notes and reading checkpoints.
The retired fields have been removed from active curricula, generated catalogs, JSON output and
the lesson schema. Their original values are preserved by stable identity in
[`archive/legacy-reading/`](../../archive/legacy-reading/README.md). The schema-only `migrate` command
exports existing values before dropping their columns and preserves all lesson/history rows. Technical primary-source research still informs experiment design.

The Go systemscoach engine remains separate, with JSON routes and atomic completion receipts.
It shares the learner commands and one complete lesson. New projects use only `lesson.md`;
the retired review template and file reader are removed. Existing interpretation was merged into
each lesson file, with source-transformation evidence preserving the relationship to prior validation.
The saved `review` command remains an alias for the same complete lesson.

## Local installation

[`scripts/school-links.py`](../../scripts/school-links.py) audits or installs canonical links for
`tutor`, `pgcoach`, `systemscoach` and six skills in both agent directories. Its preflight preserves
conflicting paths and compares every entry before converting an identical skill copy. The user
retired `pgtutor`; installation removes only its known obsolete symlink, never original course data.
Use `--check` to find later installation drift. Do not keep independently edited installed copies.

## Validation boundary

CLI tests use disposable progress and verify rendering, planned boundaries, completion/revisions,
source preservation and scaffold/build failures. They do not validate database experiments.
For a presentation-only change, compare experiment fields with the accepted baseline; run real
experiments if their behavior changes. Refresh learner catalog metadata only after testing a SQLite
backup copy and comparing logical progress/attempt history. File hashes alone can omit WAL changes.

The cleanup verification record is [course-workflow-cleanup.md](course-workflow-cleanup.md).
