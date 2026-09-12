# Systemscoach

Small local projects for learning distributed-systems and systems-programming mechanisms from
engineering write-ups. New lessons target 10–15 minutes including explanation, meaningful learner
work, evidence, interpretation, and cleanup. Existing 15–25-minute lesson estimates remain honest
metadata, not a target for new work. Existing CLIs carry the data path; supplied scaffolding keeps
learner coding focused on core logic, with Go first and Deno second.

Every lesson reserves meaningful work for you: construct or adapt a command, change a consequential
setting, implement a core decision, or investigate a failure. Setup is supplied; optional hints and
a clearly labelled worked reference appear below the task in the complete lesson output. See the
[learner work standard](docs/knowledge/learner-work.md).

Run **`systemscoach`** or **`systemscoach courses`** to discover existing systems courses, their
available lesson counts and the commands to open them. `list` and `topics` are aliases.

Start in chat: **“Use systemscoach to help me choose a project”** or **“Use systemscoach with this
write-up: URL.”** The skill conducts a short interview and proposes a bounded Markdown route under
[`future-courses/`](../future-courses/). No project JSON, scaffolding, lab, or validation suite is
created during planning. Once you agree and request implementation, the route is converted into the
Systemscoach JSON/Markdown format and authored in small batches. The first selected topic has a
[approved Cursor Git roadmap](projects/cursor-git/PLAN.md): eight lessons on publication and
rebuildable replicas, with **lessons 1–3 available**. Start with `systemscoach cursor-git 1 lesson`
or see the full sequence with `systemscoach cursor-git route`.
The [saved ideas](docs/project-ideas.md) include all 15 examples from your supplied doc.

```sh
systemscoach courses
systemscoach <topic> route
systemscoach use <topic>
systemscoach 1 lesson
systemscoach 1 done
```

You can also put the topic before the lesson number. `route` includes planned steps; only authored,
validated steps can be opened or completed. `lesson` is complete: explanation and diagram before
the task, then evidence, interpretation, worked reference, and cleanup. `review` remains a read-only
compatibility alias for the same output; it is not a separate step. `done` is the only command that
writes a completion receipt.
The CLI does not generate lessons or run your experiments. The skill handles planning and authoring.

Use `bin/systemscoach` directly from this folder, or install the launcher and skill with
`./install.sh`. Go 1.24+ is required (standard library only). The launcher resolves this checkout,
including when invoked through a symlink. The initial `go run` may compile the small CLI.

- [Ranked project ideas and teaching focus](docs/project-ranking.md)
- [Design and interview workflow](docs/design-workflow.md)
- [Authoring and validation](docs/authoring.md)
- [Project/progress format](docs/format.md)
- [Skill](skills/systemscoach/SKILL.md)
- [Systems knowledge store](docs/knowledge/README.md) — reusable findings updated after systems tasks

Development: `go test ./...`, `go vet ./...`, `go build ./cmd/systemscoach` (choose an output path
outside the source tree). Tests use isolated temporary progress. Other courses and their learner
progress are independent of this project track.
