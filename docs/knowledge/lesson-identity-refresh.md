# Stable lesson identity during course reordering

Course ordinals are presentation order, not learner-history identity; verified on 2026-09-04.

## What happened

The SQLite expansion exposed an engine seed bug: `src/main.ts` used ordinal as the lesson ID.
Reordering a course could therefore attach an existing completion, note or attempt to a different
slug. Preserving slugs in curriculum sources alone did not prevent the misattribution.

The refresh implementation now matches existing rows by slug, preserves their IDs, and allocates
new IDs above the previous maximum. It temporarily parks ordinals to avoid uniqueness collisions,
maps prerequisite ordinals to stable IDs, and retains retired lesson rows as inactive history.

## Why it matters

Adding or consolidating lessons must not rewrite what a learner actually completed. Moving lesson
20 to position 21 is not the same operation as replacing the lesson's identity. A removed slug
should not donate its history to the replacement at its old ordinal.

## How to apply

- Preserve slugs for surviving lessons. Retirement is intentional and should name the surviving
  coverage in the course plan; do not transfer retired completion credit automatically.
- Use explicit lesson revisions: preserve the prior effective revision for editorial-only work;
  bump materially changed experiments. New slugs begin at their declared initial revision.
- The regression test in `curriculum-tools/tests/main_test.ts` exercises reorder, removal,
  reintroduction, notes, attempts, skip/done state, prerequisites and repeated refresh. Keep those
  cases when changing seeding again.
- Run migration checks on a COPY of `progress.sqlite`, passing its explicit `--db` path to tutor.
  Compare rows by slug, not ordinal. Hash the real learner file before and after; do not refresh or
  mark progress in the real file as a convenient authoring test.
- Rebuild generated `lessons.json` from the TypeScript curriculum before testing. It remains a
  committed build artifact, not a place to edit lessons or repair progress.
