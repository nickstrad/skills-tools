# Go tutor migration

The tutor reads Markdown lessons directly and keeps course-scoped learner history and the roadmap
in one SQLite database; validate representation changes against frozen output and copied history.

## What happened

On 2026-09-12 the course CLI moved from TypeScript to Go. The launcher is `bin/tutor`; the module
is `curriculum-tools/`, with Cobra 1.10.2 and modernc.org/sqlite 1.58.0. The 250 authored lessons
were converted without changing their experiment content. Their source is now
`courses/<id>/lessons/NN-<slug>.md`; `tutor <course> check` parses and validates those files.
There is no generated lesson catalog or content build step.

The unified `tutor` skill replaces the separate course skills. `curriculum-author` remains for
planning and authoring. Retired coach commands and their owned installed symlinks were removed.
The source/tooling archive is recoverable from commit `9fc73b2`, explained in the
[engine archive](../../archive/deno-engine/README.md). Historical checks retain their original
commands and source hashes; they were not retrospectively rewritten as Go validation.

## Why it matters

The live learner catalogs can be older than authored source. Comparing a freshly initialized
database with an untouched learner catalog confuses representation drift with an intentional
refresh. The migration therefore captured separate raw-history and refreshed-source oracles.

Go rendering matched all 250 lessons. The original end-to-end gates compared 1,145 output files;
the primary additionally compared 1,130 nonduplicated CLI outputs while all five courses shared
one database, both before and after refreshing the copies. JSON key order and the explicit
temporary `--db` footer path were normalized; lesson content and progress status were not.
Read commands left database and WAL bytes unchanged. Temporary parity tests were removed after
acceptance; their source is in the migration's Git history.

## One database

`curriculum-tools/tutor.sqlite` contains lessons keyed by `(course_id, slug)`, global lesson IDs,
progress, attempts, prerequisites, and roadmap tables. Migration remapped integer IDs while
preserving content, status, notes, timestamps and relationships. Completion never transfers
between courses. Original databases remain protected under
`curriculum-tools/.cache/legacy-progress/<course-id>/progress.sqlite*`.

The final audit compared every original lesson field, progress row, attempt and prerequisite by
stable identity. All 15 main/WAL/SHM backup hashes matched the baseline. Original counts were:

| Course | Stored lessons, including retired | Progress rows | Attempts |
| --- | ---: | ---: | ---: |
| grpc | 6 | 6 | 6 |
| linux | 72 | 0 | 0 |
| postgres | 99 | 8 | 8 |
| postgres-essentials | 26 | 22 | 23 |
| sqlite | 48 | 0 | 0 |

These stored counts intentionally differ from some authored lesson counts. The learner databases
were consolidated, not refreshed. The roadmap was imported through its CLI: 19 topics and 49
follow-ups. A fresh-copy import/export reproduced the committed snapshot byte-for-byte.

## How to apply

- Add a course only after route sign-off and a batch request, using `tutor new-course`; author
  Markdown according to [AUTHORING.md](../../curriculum-tools/docs/AUTHORING.md).
- Use `tutor <course> route`, then `[N] lesson`; only an explicit user completion request
  authorizes `N done`. Read views do not initialize or refresh progress.
- Refresh safety is checked with `tutor <course> progress verify`: the source is read-only,
  nonempty WAL/journal files are conservatively refused, and only the selected course is seeded
  in a disposable byte copy. All-course progress/attempts, selected-course identities and
  other-course content/prerequisites must survive. Observed source changes fail the check.
- Real experiments use `tutor <course> validate`. SQLite isolation supplies a per-lesson working
  directory and database, including shell fallback; it does not isolate a PostgreSQL server.
  Course `repl.env` overrides process environment, so use a private course configuration for
  private PostgreSQL endpoints. Never validate against the learner's `/labs/pglab` or port 5440.
- Consolidation is a maintenance command, not routine startup. Existing consolidated courses
  are refused unless explicit replacement is requested. Legacy files and their sidecars are
  preserved as backups. Run maintenance with learner writers stopped and visible; process
  visibility in a sandbox is insufficient to establish that the host has no writer.
- Run Go build, vet and race tests from `curriculum-tools/`; the final post-retirement suite
  passed. The launcher clears only recognized stale gRPC lab `GOPATH`/`GOCACHE` values and
  preserves other user overrides. Go's normal caches are separate from disposable lab state.

## Accepted evidence and scope

Small permanent reports are under [go-tutor-migration-evidence/](go-tutor-migration-evidence/):
[final race tests](go-tutor-migration-evidence/final-race.txt),
[history/backup audit](go-tutor-migration-evidence/progress-audit.txt),
[SQLite smoke](go-tutor-migration-evidence/sqlite-smoke.txt), and
[Linux smoke](go-tutor-migration-evidence/linux-smoke.txt).

SQLite lessons 1–3 showed repeatable setup, actual build capabilities, and committed versus
uncommitted visibility between live connections. Linux lesson 2 supplied the shell smoke because
the gRPC lab tools remain pruned. No PostgreSQL experiment ran during this migration.

The five existing Python files under course `lab/` directories are unchanged native experiment
fixtures. Their Go port and removal of Deno from VM/bootstrap/Docker installation scripts remain
explicitly deferred. Historical logs, archived source and historical command references are
provenance, not active tooling. The learner's original postmaster remains at `/labs/pglab/primary`.

Seventeen preserved PostgreSQL reference lessons mention `pgcoach inspect`/`hint2` stages that
were already unsupported by the previous wrapper. The reference README and tutor skill explain
this inherited limitation; the migration did not change lesson experiments or silently add a
new progression stage.
