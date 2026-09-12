# Shared concise course CLI

Updated 2026-09-12 for the Go CLI.

The learner uses one `tutor` command for installed and planned courses. The normal flow is
`tutor <course> route`, `tutor <course> [NUMBER] lesson`, then
`tutor <course> NUMBER done` or `skip`; only explicit learner decisions record progress. The three reference
catalogs are publicly named `postgres-legacy`, `sqlite-legacy`, and `linux-legacy`. Their original
IDs (`postgres`, `sqlite`, and `linux`) remain the stored identities and compatibility aliases.

## What happened

- Planning and implementation are separate. A future route under `future-courses/<folder>/course.md`
  owns discussion and sign-off; the batch workflow and authoring guide own implementation. A
  canonical numbered table fixes titles and stable slugs. Route/catalog mismatches and duplicate
  identities fail before `init` replaces lesson rows. A new-course scaffold is empty and neutral:
  it creates no invented lesson, REPL, catalog, or progress.
- Course content is Markdown at `curriculum-tools/courses/<id>/lessons/NN-slug.md`, with one
  canonical route in `PLAN.md` or a future-course plan. `tutor <course> check` validates lesson
  files and their route before `init` refreshes the shared database.
- `tutor courses` discovers installed and planned courses. `route` reads progress and distinguishes
  done, skipped, stale, available, and planned rows. Planned routes can be browsed without creating a
  database; planned lessons cannot be served or completed.
- `tutor lesson` renders the complete unit: context, a useful mechanism diagram, setup and run
  commands, expected evidence, interpretation, optional variation, and cleanup. Presentation is
  read-only. There are no `review`, `full`, or `start` commands or learner stages.
- Every course uses `curriculum-tools/tutor.sqlite`, with `course_id` separating histories. Legacy
  per-course files are preserved as read-only backups under
  `.cache/legacy-progress/<course-id>/`; stable slugs preserve learner identity when ordinals move.
- The roadmap is served by `tutor roadmap` from the roadmap tables in `tutor.sqlite`; the committed
  `curriculum-tools/roadmap/roadmap.json` is its export snapshot. `tutor roadmap import` and
  `export` are explicit maintenance operations.
- Reading checkpoints and retired reading columns are absent from active lesson rendering. Their
  source values remain in [`archive/legacy-reading/`](../../archive/legacy-reading/README.md), and
  technical source research remains author input rather than a progression stage.
- The retired systemscoach project and its writing remain archive references. Their useful learner
  work policy is generalized in [learner-work.md](learner-work.md); the active engine is the shared
  Go CLI.

## Why it matters

Presentation, course identity, and learner history must stay separate. A planned row is navigation,
not progress; an ordinal is display order, not identity; and a rendered command is not evidence that
the learner completed a lesson. The single database makes those rules consistent across courses.

## How to apply

```sh
bin/tutor courses
bin/tutor postgres-legacy route
bin/tutor postgres-essentials route
bin/tutor postgres-essentials lesson 3 --plain
bin/tutor postgres-essentials 3 done
bin/tutor postgres-legacy 4 skip
bin/tutor postgres-legacy undone 4
bin/tutor roadmap
```

Use `--root` for a copied curriculum and `--db` for an explicitly isolated database. Run
`tutor <course> progress verify --db /path/to/tutor.sqlite` before refreshing a learner catalog;
the command checks a copy and leaves the source unchanged. Run `tutor <course> validate` only with
an owned real-tool endpoint. Keep the learner lab and shared progress file out of validation.

The installer is now `tutor install [--check]`. It installs the `tutor` launcher and the
`curriculum-author` and `tutor` skills, removes only recognized retired links, and preserves
unrelated paths. The old course-specific launchers and the systemscoach tool are historical
archive material.

The historical cleanup acceptance is preserved in
[`archive/course-history/school/knowledge/`](../../archive/course-history/school/knowledge/).
