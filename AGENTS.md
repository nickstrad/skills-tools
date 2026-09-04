# Repository guidance for agents

Read [`docs/README.md`](docs/README.md) before working in this repository. It
indexes the durable research and operational notes that already exist; use those
documents instead of repeating expensive discovery work.

When planning or revising lessons, consult [`docs/articles/README.md`](docs/articles/README.md)
for learner-selected articles and interests. Use relevant insights to motivate bounded
experiments; distinguish the learner's preferences, source claims, and proposed applications.

Read [`docs/learner-profile.md`](docs/learner-profile.md) to calibrate course depth. Nick's KCNA,
Kubernetes production experience, Docker familiarity, and own repositories inform what to skip
or shorten; they do not imply that every internals topic is already mastered or authorize copying
his projects into coursework. Host-init administration is outside the requested learning path.

## PostgreSQL course and book

The canonical PostgreSQL book material is under
[`docs/books/postgresql-14-internals/`](docs/books/postgresql-14-internals/).
Start with:

1. `research-notes.md` for scope and settled judgement calls.
2. `reading-map.md` for the citation assigned to each of the 96 lessons.
3. `pg14-internals-chapters.md` for chapter coverage, identifiers, gaps, and
   topic lookup.
4. `lesson-writeup-spec.md` when authoring or reviewing lesson metadata.

Do not read or re-extract the 6.3 MB PDF on every turn. The Markdown research
was produced from the book and checked against its table of contents. Open the
PDF only when the digest explicitly leaves a question unresolved or the user
asks for primary-page verification. If new book research changes a conclusion,
update the Markdown research so the next agent can reuse it.

The PostgreSQL course lives at `curriculum-tools/courses/postgres/`. Its `docs`
path is a symlink to the canonical book folder above. Do not duplicate the PDF
or research files in the course tree.

## Course editing rules

- Read `curriculum-tools/docs/AUTHORING.md` and the `curriculum-author` skill
  before changing lesson content.
- Edit `curriculum/*.ts`; never hand-edit generated `lessons.json` or learner
  `progress.sqlite`.
- Preserve experiment behavior unless the task explicitly asks for a semantic
  change. Metadata-only rewrites must not change setup, commands, expected
  results, safety levels, sessions, or slugs.
- Run Deno from `curriculum-tools/` with `/root/.deno/bin/deno` when it is not
  on `PATH`.
- Keep unrelated working-tree changes intact. Multiple agents may own separate
  module files at the same time; never edit a file assigned to another agent.

## Durable findings

General repository and validation findings belong in `docs/knowledge/` and its
index. PostgreSQL 14 Internals research and lesson-to-book mapping findings
belong beside the book under `docs/books/postgresql-14-internals/`.
