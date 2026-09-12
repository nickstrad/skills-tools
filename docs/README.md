# Documentation index

Read this file before searching the repository or re-analyzing a bundled reference.

## First operational task: VM resources and cleanup

Read `/root/disk-usage-report.md` when available, then follow
[`knowledge/vm-resource-cleanup.md`](knowledge/vm-resource-cleanup.md). Revalidate disk usage,
memory and live processes before allocating or deleting resources. Stop and clean owned labs
throughout a task, budget temporary copies and archives, and perform final cleanup before declaring
the goal complete. Keep the learner's `/labs/pglab` and progress intact so the next lesson can
start. The September 2026 report is a historical inventory, not a deletion allowlist.

## Learning roadmap

The current [PostgreSQL Essentials route](../curriculum-tools/courses/postgres-essentials/PLAN.md)
lists 40 bounded lessons with specific outcomes. Its first 26 are authored; `pgcoach` opens this
course. Nick currently reports about ten minutes per lesson; the plan's 20–30 minute ranges are
older nominal estimates, not measured pace. [Implementation findings](knowledge/postgres-essentials.md)
explain separate progress, reference access and validation. The old 9–12 coaching pilot is no
longer the entry path.

Future courses are first defined as inexpensive Markdown routes in
[`../future-courses/`](../future-courses/). Start with its [planning guide](../future-courses/README.md)
and [template](../future-courses/TEMPLATE.md), then implement an agreed route in small batches. The
[SQLite plan](../future-courses/sqlite/course.md) proposes 32 concise lessons; the existing
54-lesson course remains unchanged reference material. Planning does not authorize course
scaffolding, validation infrastructure, or progress changes.

The learner interface is shared across courses: `tutor <course> <number> lesson|done`, with
`tutor <course> lesson` for the next unfinished lesson. A lesson includes its context, commands,
expected evidence, interpretation, and cleanup. It may contain readable terminal diagrams before
commands, but never requires a separate review view, study stop, homework, or external reading.
Only explicit completion changes progress. `tutor <course> route` distinguishes completed,
available, and planned entries; a valid `future-courses/<folder>/course.md` plan can be viewed there
before implementation without creating progress.

The [gRPC and Protocol Buffers practice course](../curriculum-tools/courses/grpc/README.md)
provides six focused CLI walkthroughs (65 minutes), with a 37-minute quick route. Its
[authoring findings](knowledge/grpc-course.md) record the scoped coaching preference and tool quirks.

[`learner-profile.md`](learner-profile.md) records Nick's stated experience and preferences. Read it
before choosing course depth. The [prior-project review](knowledge/prior-project-experience.md) uses
his repositories to identify familiar material to omit or compress; it is not a request to copy
those projects. The [website and résumé notes](knowledge/learner-background-sources.md) add
professional background, further project exposure, and provenance for the learner's OS/Linux/DDIA
readings.

[`learning_path.md`](learning_path.md) lists separate topics, tool descriptions, course goals and
2–4 short optional Go follow-ups per topic, with compact terminal diagrams. Use it when choosing
what to learn or author next; its future projects are not yet implemented courses.
[`learning_path-reference.md`](learning_path-reference.md) preserves detailed software choices,
research, measurement rules and earlier synthesis proposals. The
[Linux/database integration proposal](knowledge/linux-database-integration.md) is a separate
reference for a possible future course refactor.

## Repository knowledge

[`knowledge/README.md`](knowledge/README.md) indexes reusable findings about the tutor engine,
validation harness, course authoring workflow, and tool-specific pitfalls.

The [PostgreSQL final integration findings](knowledge/postgres-refactor-integration.md) explain
source/evidence correspondence, copied progress checks and final retirement of validation resources.

## Articles and learner insights

[`articles/README.md`](articles/README.md) indexes articles the learner finds compelling, their
stated interests, and possible connections to lessons. Consult it when planning or revising courses.
Start with the saved notes; reopen sources when a proposed experiment needs more precise
verification. These are teaching inputs, not automatic course changes.

## Books and course research

### PostgreSQL 14 Internals

Canonical folder: [`books/postgresql-14-internals/`](books/postgresql-14-internals/)

| File                             | Use it for                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `research-notes.md`              | Understand how the research was produced, what the book does not cover, and which mappings required judgement. Read this first.    |
| `reading-map.md`                 | Look up the exact citation for each of the PostgreSQL course's 92 active lessons.                                                  |
| `pg14-internals-chapters.md`     | Find chapter summaries, commands, views, settings, coverage gaps, and the topic-to-section index.                                  |
| `lesson-writeup-spec.md`         | Author or review lesson `reading`, `readingNotes`, and `syntaxBreakdown` metadata consistently.                                    |
| `lesson-retrofit-findings.md`    | Reuse the coverage decisions, cross-version cautions, writing lessons, and integration audit findings from the 96-lesson retrofit. |
| `study-checkpoint-plan.md`       | Historical design for seven reading stops; current courses treat these references as optional and do not pause progress.           |
| `postgresql_internals-14_en.pdf` | Primary source. Consult only when the Markdown research leaves a real ambiguity or the user requests page-level verification.      |

### SQLite readings

Selective SQLite source research and optional reading maps live in
[`readings/sqlite/`](readings/sqlite/):

- [`essentials-proposal.md`](readings/sqlite/essentials-proposal.md) — research behind the 32-lesson
  [future-course plan](../future-courses/sqlite/course.md), including reuse and optional scope; not
  an implemented course.
- [`research-notes.md`](readings/sqlite/research-notes.md) — annotated primary-source inventory,
  exact section scopes, time estimates, version caveats, and rejected readings.
- [`study-checkpoint-plan.md`](readings/sqlite/study-checkpoint-plan.md) — optional source map
  retaining the useful references from six retired reading stops; never a progression requirement.

Do not repeatedly extract or scan the whole PDF. Improve the reusable research notes when new
verification changes a conclusion.

## Systems project builder

[Systemscoach](../systems-projects/README.md) turns a selected engineering write-up into a minimum
approved project agenda and short lesson batches. It is separate from the tool-internals courses.
[Project ideas](../systems-projects/docs/project-ideas.md) preserve the learner’s supplied shortlist;
[builder findings](knowledge/systemscoach.md) explain its CLI, progress identities and validation.
The repository resource/cleanup rules apply to every project and batch.
