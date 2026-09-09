# Systemscoach

Small local projects for learning distributed-systems and systems-programming mechanisms from
engineering write-ups. Each lesson takes 15–25 minutes: understand, predict, manipulate, inspect,
explain and clean up. Existing CLIs carry the data path; supplied scaffolding keeps learner coding
focused on core logic, with Go first and Deno second.

Run **`systemscoach`** or **`systemscoach courses`** to discover existing systems courses, their
available lesson counts and the commands to open them. `list` and `topics` are aliases.

Start in chat: **“Use systemscoach to help me choose a project”** or **“Use systemscoach with this
write-up: URL.”** The skill conducts a short interview and proposes a complete minimum agenda.
Once you agree, request a small batch. The first selected topic has a
[draft Cursor Git roadmap](projects/cursor-git/PLAN.md): eight lessons on publication and rebuildable
replicas, visible with `systemscoach cursor-git route`. No lessons are authored yet.
The [saved ideas](docs/project-ideas.md) include all 15 examples from your supplied doc.

```sh
systemscoach courses
systemscoach <topic> route
systemscoach use <topic>
systemscoach 1 lesson
systemscoach 1 review
systemscoach 1 done
```

You can also put the topic before the lesson number. `route` includes planned steps; only authored,
validated steps can be opened or completed. Lesson/review are read-only; `done` is explicit.
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
