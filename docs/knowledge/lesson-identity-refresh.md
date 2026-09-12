# Stable lesson identity during course reordering

Updated 2026-09-12 for the Go CLI.

Course ordinals are presentation order; the stable lesson slug is the learner-history identity.
The shared `tutor.sqlite` schema stores course identity, lesson rows, prerequisites, progress, and
attempts together.

## What happened

The SQLite expansion exposed an engine seed bug: using ordinal as the lesson ID could attach an old
completion, note, or attempt to a different lesson after reordering. The Go refresh matches existing
rows by `(course_id, slug)`, preserves their IDs, allocates new IDs above the previous maximum, and
temporarily parks ordinals to avoid uniqueness collisions. Prerequisites follow the stable IDs, and
retired lessons remain inactive history.

## Why it matters

Adding a lesson, moving lesson 20 to position 21, and replacing a lesson at position 20 are three
different operations. Slug preservation keeps the first two safe; a retired slug must not donate its
completion to a replacement.

## How to apply

- Preserve slugs for surviving lessons. Name intentional retirement and surviving coverage in the
  course plan; do not transfer retired completion credit.
- Keep the prior revision for editorial-only work. Bump `revision` when an available experiment
  materially changes; a new slug starts at its declared revision.
- Keep regression coverage for reorder, removal, reintroduction, notes, attempts, skip/done state,
  prerequisites, and repeated refresh. Tests should locate mechanism metadata rather than assume a
  particular display number.
- Run `tutor <course> progress verify --db /path/to/tutor.sqlite` before refreshing. The command
  treats the source as read-only, makes its own temporary copy, and compares named-course lesson
  identities by slug while preserving all-course progress and attempts. It also confirms that other
  courses' lesson content and prerequisites remain unchanged by stored ID. The named course's
  content and prerequisites are expected to refresh from current Markdown, so they are not asserted
  unchanged. A positive-size WAL or journal beside the source is refused.
- Use `tutor <course> init --db /path/to/copy/tutor.sqlite` only on an isolated copy. Never refresh,
  mark completion, or use a real learner database as an authoring test.
- Validate the Markdown source with `tutor <course> check`; do not edit a generated catalog or
  database row by hand to repair a route.
