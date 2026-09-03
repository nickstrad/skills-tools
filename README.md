# skills-tools

Durable home for two local, Deno-based curriculum systems and their Codex
skills. Both tools keep lesson content in Git and learner progress in local
SQLite files that are intentionally ignored. They display exercises and track
progress; they do not execute lesson SQL for you.

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
- Bundled PostgreSQL course (38 lessons) plus starter DuckDB and SQLite courses
- Per-course wrapper skills under `courses/<course>/skill/`

### `pg-systems-tutor/`

The original standalone PostgreSQL curriculum and progress tracker.

- Dedicated CLI: `bin/pgtutor <command>`
- Complete 100-lesson dataset in `data/lessons.json`
- Codex skill under `skill/pg-systems-tutor/`
- CLI and skill tests

The standalone project remains useful as the complete original curriculum. The
generalized engine is the path for authoring new courses and the newer
experiment-driven PostgreSQL curriculum.

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

# Standalone PostgreSQL tutor
./pg-systems-tutor/bin/pgtutor init
./pg-systems-tutor/bin/pgtutor pretty
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
ln -sfn /root/Software/skills-tools/curriculum-tools/courses/duckdb/skill/duckdb-tutor \
  ~/.codex/skills/duckdb-tutor
ln -sfn /root/Software/skills-tools/curriculum-tools/courses/sqlite/skill/sqlite-tutor \
  ~/.codex/skills/sqlite-tutor
ln -sfn /root/Software/skills-tools/pg-systems-tutor/skill/pg-systems-tutor \
  ~/.codex/skills/pg-systems-tutor
```

If the repository is cloned elsewhere, replace `/root/Software/skills-tools` in
the skill files or keep a symlink at that path.

## Development and verification

```sh
cd curriculum-tools
deno task build postgres
deno task check
deno task test

cd ../pg-systems-tutor
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
├── pg-systems-tutor/       standalone PostgreSQL CLI, 100 lessons, and skill
├── .gitignore              excludes runtime state, secrets, logs, and editor files
└── README.md
```
