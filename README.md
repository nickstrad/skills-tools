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

- One CLI for multiple courses: `bin/tutor <course> <command>`
- Course authoring skill, reusable course template, build tooling, validation
  harness, and tests
- Bundled PostgreSQL course (96 lessons in 15 modules), complete SQLite course,
  and complete Linux Systems course (72 lessons in 12 modules)
- Per-course wrapper skills under `courses/<course>/skill/`

## Requirements

- Deno 2
- The course's command-line tool when actually running exercises (`psql`,
  `duckdb`, `sqlite3`, etc.)

On a fresh droplet, `scripts/lab-setup.sh` installs all of these.

The launchers use `DENO_BIN` when set, then `deno` on `PATH`, with a final
fallback to `/root/.deno/bin/deno` on these droplets.

## Quick start

```sh
cd ~/Software/skills-tools

# Generalized engine
./curriculum-tools/bin/tutor courses
./curriculum-tools/bin/tutor postgres init
./curriculum-tools/bin/tutor postgres pretty
./curriculum-tools/bin/tutor linux init
./curriculum-tools/bin/tutor linux modules
./curriculum-tools/bin/tutor linux pretty 1
```

Use `--db PATH` with course commands when you want isolated progress. Displaying
a lesson never marks it complete; use `done NUMBER` only after completing it.

## Install the Codex skills on a fresh droplet

The checked-in skills point to this repository at `/root/Software/skills-tools`,
matching the clone location used for the droplet. Symlink the skills so future
pulls update them in place:

```sh
mkdir -p ~/.codex/skills
ln -sfn /root/Software/skills-tools/curriculum-tools/skills/curriculum-author \
  ~/.codex/skills/curriculum-author
ln -sfn /root/Software/skills-tools/curriculum-tools/courses/postgres/skill/postgres-tutor \
  ~/.codex/skills/postgres-tutor
ln -sfn /root/Software/skills-tools/curriculum-tools/courses/sqlite/skill/sqlite-tutor \
  ~/.codex/skills/sqlite-tutor
ln -sfn /root/Software/skills-tools/curriculum-tools/courses/linux/skill/linux-tutor \
  ~/.codex/skills/linux-tutor
```

If the repository is cloned elsewhere, replace `/root/Software/skills-tools` in
the skill files or keep a symlink at that path.

## Documentation and knowledge base for agents

Start with `docs/README.md`. It indexes the reusable book research under
`docs/books/` and the repository findings under `docs/knowledge/`: tooling
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
├── docs/knowledge/         findings for future agents; read the index before starting work
├── .gitignore              excludes runtime state, secrets, logs, and editor files
└── README.md
```
