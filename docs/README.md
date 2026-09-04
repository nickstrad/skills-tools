# Documentation index

Read this file before searching the repository or re-analyzing a bundled
reference.

## Repository knowledge

[`knowledge/README.md`](knowledge/README.md) indexes reusable findings about the
tutor engine, validation harness, course authoring workflow, and tool-specific
pitfalls.

## Books and course research

### PostgreSQL 14 Internals

Canonical folder:
[`books/postgresql-14-internals/`](books/postgresql-14-internals/)

| File                             | Use it for                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `research-notes.md`              | Understand how the research was produced, what the book does not cover, and which mappings required judgement. Read this first.    |
| `reading-map.md`                 | Look up the exact citation for each of the PostgreSQL course's 96 lessons.                                                         |
| `pg14-internals-chapters.md`     | Find chapter summaries, commands, views, settings, coverage gaps, and the topic-to-section index.                                  |
| `lesson-writeup-spec.md`         | Author or review lesson `reading`, `readingNotes`, and `syntaxBreakdown` metadata consistently.                                    |
| `lesson-retrofit-findings.md`    | Reuse the coverage decisions, cross-version cautions, writing lessons, and integration audit findings from the 96-lesson retrofit. |
| `study-checkpoint-plan.md`       | Follow or revise the seven bounded, course-order reading stops and their PostgreSQL-version exclusions.                            |
| `postgresql_internals-14_en.pdf` | Primary source. Consult only when the Markdown research leaves a real ambiguity or the user requests page-level verification.      |

### SQLite readings

Selective SQLite source research and the course-order checkpoint design live in
[`readings/sqlite/`](readings/sqlite/):

- [`research-notes.md`](readings/sqlite/research-notes.md) — annotated primary-source inventory,
  exact section scopes, time estimates, version caveats, and rejected readings.
- [`study-checkpoint-plan.md`](readings/sqlite/study-checkpoint-plan.md) — six proposed mandatory
  reading stops after lessons 13, 19, 25, 31, 37, and 41, plus implementation and validation rules.

Do not repeatedly extract or scan the whole PDF. Improve the reusable research
notes when new verification changes a conclusion.
