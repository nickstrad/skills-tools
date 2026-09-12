# skills-tools

Durable home for local, Go-based systems curricula and their Codex skills. The
tools keep Markdown lesson content in Git and learner progress in the ignored
`curriculum-tools/tutor.sqlite` database. A normal lesson view displays the
commands and evidence for you to run. Authors may explicitly run
`tutor <course> validate` against isolated state; viewing a lesson does not run
its commands or change completion.

## Projects

### `scripts/`

Machine bootstrap scripts. `scripts/lab-setup.sh` turns a fresh Ubuntu droplet
into the development environment everything here assumes (PostgreSQL, SQLite,
DuckDB, Go, Docker, Claude Code, Codex, mosh/tmux, and the usual
Linux debugging tools). Run it first on a new VM; see `scripts/README.md`.

### `curriculum-tools/`

The generalized curriculum engine for building and running hands-on systems
courses.

- One CLI for multiple courses: `bin/tutor <course> route|<number> lesson|done`; the reference
  catalogs are exposed as `postgres-legacy`, `sqlite-legacy`, and `linux-legacy` while their
  original stored IDs and paths remain `postgres`, `sqlite`, and `linux`.
- Course authoring skill, reusable course template, build tooling, validation
  harness, and tests
- [PostgreSQL Essentials](curriculum-tools/courses/postgres-essentials/PLAN.md): a fixed 40-lesson
  route, with the first 26 available; Nick currently takes about ten minutes per
  lesson, while its older 20–30 minute labels remain unmeasured author estimates
- Original PostgreSQL reference (92 lessons in 15 modules), complete SQLite course,
  and complete Linux Systems course (72 lessons in 12 modules)
- [gRPC and Protocol Buffers](curriculum-tools/courses/grpc/README.md): six focused CLI experiments,
  about 65 minutes total, retained as reference; reinstall its pruned tools before running experiments
- A shared tutor skill and course authoring skill under `curriculum-tools/skills/`

### `archive/`

[Archived course history](archive/README.md) holds superseded plans, prototype guides and preserved
legacy metadata. Current curricula, progress and future course plans remain in their active folders.

## Requirements

- Go 1.26 or newer
- The course's command-line tool when actually running exercises (`psql`,
  `duckdb`, `sqlite3`, etc.)

On a fresh droplet, `scripts/lab-setup.sh` installs the common database and shell tools.
The gRPC course has its own [pinned installer](curriculum-tools/courses/grpc/README.md).

The launcher builds the Go CLI from `curriculum-tools/` and can use `TUTOR_BIN`
to run an already-built binary. `tutor install` creates the canonical launcher
and skill links for both supported agents.

## Quick start

```sh
cd ~/Software/skills-tools

bin/tutor courses
bin/tutor roadmap
bin/tutor postgres-legacy route
bin/tutor postgres-essentials route
bin/tutor postgres-essentials init
bin/tutor postgres-essentials 1 lesson
bin/tutor postgres-essentials 1 done
bin/tutor install
```

Run `bin/tutor <course> init` before the first completion to initialize or refresh
that course in the shared database. Use `--db PATH` with course commands when
you need an isolated copy. Displaying a lesson never marks it complete; only explicit `done`
records completion. `skip`, `undone`, and `note` are separate progress operations. The generic forms are
`tutor <course> <number> lesson|done|skip`; `tutor <course> lesson` opens the next eligible lesson.
`tutor <course> route` labels completed, available, skipped, and planned lessons. It can also show a valid
`future-courses/<folder>/course.md` route before the course is implemented; those planned rows do
not create completion records.

The legacy reference commands accept their original spellings as compatibility aliases: `postgres`,
`sqlite`, and `linux` resolve to the same stored courses as the suffixed public names. There is one
catalog and one progress history per course.

Each lesson is the complete study unit: concise context, commands, expected evidence,
interpretation, and cleanup. There is no required second review view, assigned reading stop, homework,
or written response. External references are optional. Mechanism diagrams appear before commands when they
make ownership, order, layout, contention, or state changes easier to see; plain text carries the
meaning and ANSI colour may only enhance it.

Future courses begin as cheap Markdown plans under [`future-courses/`](future-courses/). Use
[`future-courses/TEMPLATE.md`](future-courses/TEMPLATE.md) to agree a small fixed route before any
course scaffolding or validation work. The proposed SQLite route is
[`future-courses/sqlite/course.md`](future-courses/sqlite/course.md); the existing 54-lesson SQLite
course remains a reference, not the implementation target for that proposal.

## Install the local skills and launchers

Use the tutor installer to check or install the canonical launcher and skills for both supported
agents. It does not modify course catalogs or progress:

```sh
bin/tutor install --check
bin/tutor install
```

See [`scripts/README.md`](scripts/README.md) for bootstrap details and supported course tools.

## Documentation and knowledge base for agents

Start with `docs/README.md`. It indexes future-course plans and the repository findings under
`docs/knowledge/`: tooling
quirks, how to read the validation harness, lesson-writing pitfalls per course,
and the subagent workflow that has held up. Before starting work in this
repository, read the index and the files it points to for your task. When you
finish work that taught you something another agent would otherwise rediscover,
add a new file there and a row in the index; the index explains the format.
Updating the knowledge base is part of finishing the work, not optional
follow-up.

## Development and verification

```sh
cd curriculum-tools
go test ./...
go vet ./...
tutor postgres-essentials check
```

See `curriculum-tools/docs/AUTHORING.md` for the lesson contract and pedagogy,
and `curriculum-tools/docs/VALIDATION.md` for real-tool validation. The tutor
CLI reads Markdown lesson source directly; the shared progress database is ignored.

## Repository layout

```text
skills-tools/
├── bin/tutor
├── curriculum-tools/
│   ├── cmd/tutor/
│   ├── internal/
│   ├── courses/<id>/lessons/
│   ├── skills/
│   ├── roadmap/
│   ├── templates/course/
│   └── go.mod
├── future-courses/
├── docs/
├── archive/
├── scripts/
├── .gitignore
└── README.md
```

The `internal/` packages cover course parsing, routes, progress, rendering, roadmap, validation
harnesses, links and scaffolding.
