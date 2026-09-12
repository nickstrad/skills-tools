# Archived course history

This tree keeps superseded course proposals, prototype coaching material, and design records for
provenance. The active source of truth remains under `curriculum-tools/courses/`: its current
Markdown lessons, `PLAN.md`, and validation records define the authored course. Learner history
and roadmap live in the ignored `curriculum-tools/tutor.sqlite`. Active future-course routes
remain under `future-courses/`.

Nothing under `archive/course-history/` is a learner prerequisite, a progression gate, or a current
implementation assignment. Historical model names, agent assignments, estimates, and proposed
flows describe their original context only. Archived PostgreSQL guides are retained as reference
source; their old TypeScript imports are historical references to the engine preserved in
Git (see [retired engine](deno-engine/)). The separate `archive/legacy-reading/` tree preserves retired reading
metadata and has its own inventory.

## Index

- [PostgreSQL history](course-history/postgres/): the superseded pivot plan, design contracts,
  prototype guides, and coaching/project review notes.
- [SQLite history](course-history/sqlite/): the superseded implementation analysis.
- [Linux history](course-history/linux/): the superseded refactor proposal.
- [Legacy reading archive](legacy-reading/): catalog metadata exported before reading fields were
  removed from the active engine.
- [Systemscoach archive](systemscoach/): superseded on 2026-09-12; tool retired; see its README.
- [Learning path archive](learning-path/): replaced by `tutor roadmap` and its JSON snapshot.
- [Retired Deno engine](deno-engine/): source and historical controllers retained in Git commit `9fc73b2`.
- [Completed Go tutor migration](plans/go-tutor-migration.md): task mapping, accepted work packages, parity and final cleanup.
- [School migration records](course-history/school/knowledge/): historical workflow and reading-field migration evidence.

## Old-to-new locations

| Former path | Archive path |
| --- | --- |
| `curriculum-tools/courses/postgres/REWORK-PLAN.md` | `archive/course-history/postgres/REWORK-PLAN.md` |
| `curriculum-tools/courses/postgres/designs/` | `archive/course-history/postgres/designs/` |
| `curriculum-tools/courses/postgres/guides/` | `archive/course-history/postgres/guides/` |
| `docs/knowledge/postgres-coaching-pilot.md` | `archive/course-history/postgres/knowledge/postgres-coaching-pilot.md` |
| `docs/knowledge/postgres-project1-review.md` | `archive/course-history/postgres/knowledge/postgres-project1-review.md` |
| `curriculum-tools/courses/sqlite/REWORK-PLAN.md` | `archive/course-history/sqlite/REWORK-PLAN.md` |
| `curriculum-tools/courses/linux/OVERPLAN.md` | `archive/course-history/linux/OVERPLAN.md` |

The moved records retain their content. Only local Markdown links were rebased to the active plans,
validation records, shared workflow, or their new archived neighbors. Archived guide imports
describe their original TypeScript layout; the source is inspectable through the engine's archive
commit rather than runnable from the current checkout.
