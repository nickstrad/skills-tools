# Project and progress format

The Go CLI has no third-party dependencies and reads authored JSON/Markdown directly. It renders
text; it never executes lesson commands. Tool-specific tutor catalogs/progress remain separate.

```text
systems-projects/
  projects/<topic>/
    PLAN.md                         approved scope and agreement provenance
    project.json                    complete route, including future steps
    docs/sources.md                  source claims, lab choices and open questions
    curriculum/<stable-slug>/
      lesson.md                     complete teaching, learner task, evidence, interpretation, cleanup
    lab/                            supplied service launchers, fixtures, core-logic stubs/solutions
    validation/batch-N.md            measured evidence and cleanup
  .state/                           ignored learner state, never authored or committed
```

Plan a new topic first as inexpensive Markdown under the root [`future-courses/`](../../../future-courses/)
tree. Only after the learner agrees and requests implementation, copy `templates/project.json` and
`templates/PLAN.md`, preserving agreed slugs and outcomes. The JSON then becomes the canonical
ordered implementation roadmap; PLAN.md explains the design and agreement rather than keeping a
second numbered roadmap in sync. Existing JSON projects are not migrated merely to adopt this
planning rule.

Project fields (unknown JSON fields are rejected): `id` (directory's kebab-case identifier), `title`,
`status` (`draft` or `approved`), `objective`, `lessons` (nonempty ordered list).

Lesson fields: `slug` (unique stable kebab-case identifier), `title`, `minutes` (compatibility range
1–25; target 10–15 for new lessons and preserve honest older 15–25 estimates),
`revision` (positive integer), `outcome` (what is observed and the resulting decision),
`prerequisites` (optional earlier slugs), `available` (boolean).
An available lesson needs a nonempty `lesson.md` and an approved agenda. Interpretation and the
worked reference belong in that same lesson file. `check` validates structure; the author still
must inspect real experiment evidence.
Planned lessons need no empty Markdown scaffolds. The CLI stops at the first unfinished planned
lesson instead of skipping ahead. Prerequisites describe learning dependencies; they do not impose
completion or quiz gates.
Do not use command words (`courses`, `list`, `topics`, `use`, `check`, `help`, `lesson`, `review`, `done`, `route`) as topic IDs.

## Commands

```sh
systemscoach                         # discover systems project courses
systemscoach courses                 # aliases: list, topics
systemscoach topics
systemscoach wal-git route
systemscoach use wal-git
systemscoach 1 lesson
systemscoach 1 done
systemscoach lesson                   # first unfinished step of selected topic
systemscoach check wal-git
```

`systemscoach <topic> <n> review` is a hidden compatibility alias for the complete `lesson` output;
it reads only the merged `lesson.md`.

`SYSTEMSCOACH_ROOT` points to this project folder; the launcher supplies its own location by default.
A compiled binary invoked directly needs this variable set (otherwise it uses the working directory).
`SYSTEMSCOACH_STATE` selects the progress directory; default is `<root>/.state`.
`SYSTEMSCOACH_BIN` lets the launcher use a prebuilt binary instead of `go run`.

Course discovery reports each agenda's approved/draft status and available/total lesson count, then
prints a route command and, when an approved lesson is available, a start/continue command. Bare
invocation and all three listing names are read-only and do not require or change topic selection.

`use` changes only the selected topic. `done` requires an explicit lesson number and an available
lesson. It creates an atomic completion receipt at `.state/done/<topic>/<slug>/<revision>.json`.
Repeated done preserves the first receipt. Reads, check, route, lesson and the review alias do not write state.
Concurrent completions do not share a read/modify/write JSON document. Storage is intentionally
small and local; it is not a distributed database or proof of a distributed protocol.

Progress identity is topic + slug + revision, never ordinal. Reordering preserves the same lesson's
completion. Increment a lesson revision when changed substance warrants taking it again; the old
receipt remains history. Never reuse a retired slug for a different task or copy completion to a
new identity. Numbers may move only with an explained route revision; preserve agreed route order
within ordinary batches. Tests use temporary roots/state and never mark learner lessons complete.
