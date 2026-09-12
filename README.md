# skills-tools

Durable home for local, Deno-based systems curricula and their Codex skills. The
tools keep lesson content in Git and learner progress in local SQLite files that
are intentionally ignored. They display exercises and track progress; they do
not execute lesson commands for you.

## Projects

### `scripts/`

Machine bootstrap scripts. `scripts/lab-setup.sh` turns a fresh Ubuntu droplet
into the development environment everything here assumes (PostgreSQL, SQLite,
DuckDB, Deno, Node, Go, Docker, Claude Code, Codex, mosh/tmux, and the usual
Linux debugging tools). Run it first on a new VM; see `scripts/README.md`.

### `curriculum-tools/`

The generalized curriculum engine for building and running hands-on systems
courses.

- One CLI for multiple courses: `bin/tutor <course> route|<number> lesson|done`
- Course authoring skill, reusable course template, build tooling, validation
  harness, and tests
- [PostgreSQL Essentials](curriculum-tools/courses/postgres-essentials/PLAN.md): a fixed 40-lesson
  route, with the first 26 available through `pgcoach`; Nick currently takes about ten minutes per
  lesson, while its older 20–30 minute labels remain unmeasured author estimates
- Original PostgreSQL reference (92 lessons in 15 modules), complete SQLite course,
  and complete Linux Systems course (72 lessons in 12 modules)
- [gRPC and Protocol Buffers](curriculum-tools/courses/grpc/README.md): six focused CLI experiments,
  about 65 minutes total, retained as reference; reinstall its pruned tools before running experiments
- Per-course wrapper skills under `courses/<course>/skill/`

### `archive/`

[Archived course history](archive/README.md) holds superseded plans, prototype guides and preserved
legacy metadata. Current curricula, progress and future course plans remain in their active folders.

## Requirements

- Deno 2
- The course's command-line tool when actually running exercises (`psql`,
  `duckdb`, `sqlite3`, etc.)

On a fresh droplet, `scripts/lab-setup.sh` installs the common database and shell tools.
The gRPC course has its own [pinned installer](curriculum-tools/courses/grpc/README.md).

The launchers use `DENO_BIN` when set, then `deno` on `PATH`, with a final
fallback to `/root/.deno/bin/deno` on these droplets.

## Quick start

```sh
cd ~/Software/skills-tools

# Generalized engine
./curriculum-tools/bin/tutor courses
./curriculum-tools/bin/tutor postgres-essentials init
./curriculum-tools/bin/tutor postgres-essentials route
./curriculum-tools/courses/postgres/bin/pgcoach route
./curriculum-tools/courses/postgres/bin/pgcoach 1 lesson
./curriculum-tools/courses/postgres/bin/pgcoach 1 done
./curriculum-tools/bin/tutor linux init
./curriculum-tools/bin/tutor linux 1 lesson
./curriculum-tools/bin/tutor linux 1 done
```

Use `--db PATH` with course commands when you want isolated progress. Displaying
a lesson never marks it complete; only `<course CLI> <number> done` does. The generic forms are
`tutor <course> <number> lesson|done`; `tutor <course> lesson` opens the next unfinished lesson.
Older `pretty`, `show`, and `done NUMBER` spellings remain compatibility aliases.
`tutor <course> route` labels completed, available, and planned lessons. It can also show a valid
`future-courses/<folder>/course.md` route before the course is implemented; those planned rows do
not create completion records.

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

Use the repository helper to check or install the canonical symlinks for both supported agents and
the course launchers. It has no dependencies and does not modify course catalogs or progress:

```sh
python3 scripts/school-links.py --check
python3 scripts/school-links.py --install
```

See [`scripts/README.md`](scripts/README.md) for supported targets and alternate destination flags.

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
deno task build postgres
deno task build linux
deno task check
deno task test
```

See `curriculum-tools/docs/AUTHORING.md` for the lesson contract and pedagogy,
and `curriculum-tools/docs/VALIDATION.md` for real-tool validation. Built
`lessons.json` files are versioned; generated progress databases are not.

## Repository layout

```text
skills-tools/
├── scripts/                machine bootstrap (lab-setup.sh) and utilities
├── curriculum-tools/       generalized engine, courses, authoring skill, and validation tools
├── future-courses/         inexpensive fixed-route plans; no runnable lessons or progress
├── docs/knowledge/         findings for future agents; read the index before starting work
├── .gitignore              excludes runtime state, secrets, logs, and editor files
└── README.md
```

## Systems projects

[Systemscoach](systems-projects/README.md) is a separate project track: interview around an engineering
write-up, agree a bounded agenda, then author small batches of local systems experiments. Its learner
flow should follow the same `NUMBER lesson|done` contract without a mandatory review stage. Native
CLIs and supplied scaffolding keep learning focused on mechanisms; necessary core logic uses Go
first. [Saved project ideas](systems-projects/docs/project-ideas.md) preserve the learner’s 15
examples. No project is preselected.
