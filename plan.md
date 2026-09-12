# Plan: one Go `tutor` CLI for every course

Drafted 2026-09-12, revised the same day into delegable work packages.
**Status: in progress — Go implementation and Phase 7 complete; primary retiring old toolchain and auditing knowledge, installation and cleanup.**
(Update this line as work proceeds: `in progress — next WPx.y` / `complete`.)

This file is the single source of truth for the migration. It is written so that a fresh agent
with no conversation history can resume from it alone; see §A before doing anything.

## A. Resume protocol and status log

**Why this section exists.** Nick clears the agent's conversation context between sittings. This
file must therefore contain everything needed to continue: the goals, decisions, exact
specifications, the work packages, and the live status of each. Keep it current: every commit
that completes or advances a WP also updates the status table below and any decision or finding a
successor would otherwise have to rediscover. Do not keep migration state in chat, memory files or
a separate handoff document.

**How to resume from scratch.**

1. Read `AGENTS.md` (repository rules), then this whole file. Skim `docs/README.md` only for
   links; §B below already records the facts a fresh agent needs.
2. Run `git log --oneline -15` and `git status`. Compare with the status table: the last "done"
   WP's commit must be in the log; uncommitted changes belong to the WP marked "in progress".
3. Check `$WORK` exists with the artifacts listed in the table (`ls /root/tutor-migration`). If it
   is missing, redo WP0.1 and WP0.2 before any parity gate; the golden corpus cannot be
   regenerated after WP8.1 deletes the Deno engine (in that case use `git show <archive
   commit>` to restore it into `$WORK/deno` and run Deno from there).
4. Continue with the first WP whose status is not "done", respecting *depends*.
5. Delegate by tier (§0): write the WP's text into the subagent prompt verbatim plus the shared
   rules; review with the checklist; commit; update the table; then next WP.

**Fixed locations.**

| Name | Path | Notes |
| --- | --- | --- |
| Repository | `/root/Software/skills-tools` | branch `main`; commit only owned files per WP |
| `$WORK` | `/root/tutor-migration` | outside the repository, survives context clears; removed in WP8.4 |
| Baselines | `$WORK/baseline/` | WP0.1 hashes, database copies, dumps, `README.txt` |
| Golden corpus | `$WORK/golden/` (+ `golden.tar.gz`, SHA in table) | WP0.2 Deno outputs; the parity oracle |
| Parity results | `$WORK/parity-{a,b,c}/` | diffs and reports |
| Go | `/usr/local/bin/go` (1.26.8) | module cache default `~/go/pkg/mod` |
| Deno (until WP8.1) | `/root/.deno/bin/deno` (2.9.5) | only for WP0.2 and golden regeneration |
| Learner PostgreSQL | socket `/tmp`, port 5440, db `lab`, data `/labs/pglab/primary` | never run validation against it; read-only checks only |

**Status log.** Update in place. Status ∈ `todo | in progress | done | blocked | skipped`.

| WP | Tier | Status | Commit | Notes / evidence |
| --- | --- | --- | --- | --- |
| WP0.1 Resource preflight and progress baseline | S | done | (no repo change) | `$WORK/baseline/README.txt`: 15 GB free, 6.8 GB RAM available; 5×3 hashes; rows grpc 6/6/6, linux 72/0/0, postgres 99 (95 active)/8/8, essentials 26/22/23, sqlite 48/0/0 (lessons/progress/attempts); cluster `lab|/labs/pglab/primary|f` |
| WP0.2 Golden corpus from the Deno engine | S | done | (no repo change) | corpus SHA256: `8b1b256f2db9fec5a4edd8e7f242c242cf3f4c4bfcbe331e025c9a22a04033dc` (`$WORK/golden.tar.gz`); two variants per course, see finding 2026-09-12 (b) |
| WP0.3 Module bootstrap | F | done | see log | cobra v1.10.2 / modernc.org/sqlite v1.58.0; Go caches at `/root/go`, `/root/.cache/go-build` |
| WP1.1 course package (grammar) | F | done | see log | `internal/course` + `internal/testutil`; 8 tests |
| WP1.2 Converter and conversion | S | done | see log | 250 files; every fence is three backticks; converter test deleted in WP8.1 |
| WP1.3 render package | S | done | 3e143ba | golden tests from postgres-essentials lesson 8; `LessonRecord` exported for list/search JSON |
| WP1.4 Parity gate A | S | done | see log | 250/250 lessons byte-identical (Markdown and JSON); done as `internal/render/parity_test.go` (skips without `$WORK`; deleted in WP8.4) instead of a hidden command |
| WP1.5 Course template | S | done | see log | `templates/course/lessons/01-example.md` is byte-canonical (`FormatLessonFile` reproduces it) |
| WP2.1 progress schema and seed | F | done | see log | `Open` uses `_txlock=immediate`; read verbs use `OpenReadOnly` (`mode=ro`); Go `Init` on baseline copies == Deno `init` dumps for all 5 courses |
| WP2.2 Progress operations | S | done | 8f9b2e2 | `GetStatus` (name clash with type); `Topics` NULL-finished scan fix |
| WP2.3 Parity gate B | S | done | run only | 1145 files compared, 0 differences, through a frozen build of c05d4e4 (`$WORK/run-parity.sh parity-b`, report in `$WORK/parity-b/report.txt`); raw copies unchanged by read verbs; the five real databases hash-identical to the WP0.1 baseline |
| WP3.1 Cobra tree | O | done | c138c56 | see the WP3.1 log entry: degraded discovery keeps `check` reachable when one course drifts; non-integer lesson numbers exit 2 |
| WP3.2 route package | S | done | 18e4ea8 | `DiscoverCourses` on the real root equals golden `courses.json` |
| WP3.3 new-course scaffold | S | done | 5f35a4c | package `internal/scaffold` (not `internal/cli`); CLI wiring in WP3.1 |
| WP3.4 links and install | S | done | 1c96ad4 | package `internal/links`; `install` command wired in WP3.1 |
| WP3.5 Launcher | S | done | c05d4e4 | `env -i` run from /tmp works; second run 0.33 s; `tutor version` prints the git short hash |
| WP3.6 Parity gate C and smoke | S | done | plan-only commit | rerun through `bin/tutor` from /tmp: 1145 files, 0 differences (`$WORK/parity-c/report.txt`); write smoke on a copy passed (`$WORK/parity-c/smoke.sh`: init, done, undone, skip, note, `## Your note`, status --json, `3 lesson` == `lesson 3`); no `render-check` command ever existed, so nothing to remove; real database hashes unchanged |
| WP4.1 roadmap.json extraction | S | done | see log | 19 topics, 49 follow-ups, 6 diagrams verbatim; preamble kept all 4 paragraphs; the obsolete "pgcoach lesson-script convention" sentence is reworded in WP7.4 |
| WP4.2 roadmap package and command | O | done | 07d2ede + wiring commit | package by an opus subagent, `internal/cli/roadmap.go` by the primary; uses `<root>/tutor.sqlite` already (the Phase 9 file); real machine import happens in WP4.3 |
| WP4.3 Archive Markdown roadmap | S | done | a959159 | Archive and relinks committed; status reconciled on resume. |
| WP5.1 harness package | F | done | d205e3a | adds `ShellFallback`, `PerLesson`, `Dir` hooks for isolated validation; env precedence: process < repl.env < options |
| WP5.2 validate and progress verify | O | done | resume validation commit | Sol completed/reviewed Luna draft; primary wired and verified all five real progress copies. Full Go vet/race suite passes, including shared-file parity (404 s under race). |
| WP5.3 Real-tool smoke, old tools removed | O | done | resume harness retirement commit | Primary inspected SQLite 1–3 and Linux 2 outputs; temporary labs removed; obsolete validation/coach tools retired. |
| WP5.4 VALIDATION.md | S | done | resume harness retirement commit | Luna/high rewrite reviewed/refined by primary; private PG endpoints, environment precedence, SQLite isolation and copy-only verify documented. |
| WP6.1 fsutil scavenge | S | done | 67b4e95 | also `PublishOnceStrict` |
| WP6.2 Archive systemscoach writing | S | done | ed33e59 | 83 relative links checked, 0 broken; `docs/README.md` links fixed in WP7.4 |
| WP6.3 Delete systemscoach | O | done | resume retirement commit | Primary verified exact archived completion receipt and remaining file inventory, retired 100 KB tool tree, applied reviewed link install (15 actions). |
| WP7.1 tutor skill | O | done | resume skill commit | Sol drafted, primary reviewed; skill validator and isolated command smoke pass; old source skill files retired. Machine links updated in WP6.3/WP8.3. |
| WP7.2 AGENTS.md | O | done | resume skill commit | Sol rewrite reviewed by primary; protections retained, Markdown/Go/unified progress documented, links checked, CLAUDE.md symlink preserved. |
| WP7.3 Author skill and AUTHORING.md | S | done | resume authoring commit | Luna/high edits reviewed/refined by primary; standalone grammar, metadata-only prerequisites, isolated progress smoke, skill/link checks pass. |
| WP7.4 Remaining documentation | S | done | resume documentation commit | Active docs use direct Markdown parsing and unified CLI/DB; historical validation body preserved; 71 links and five course checks pass. |
| WP8.1 Archive-then-delete Deno engine | S | done | archive A: 9fc73b2; retirement B: see log | 150 source/catalog/controller files archived byte-identically, then removed; README records Git retrieval. Native Python lab fixtures preserved. |
| WP8.2 Knowledge cleanup | S | done | resume knowledge commit | Luna/high edits refined by primary; historical records archived, active advice updated, scoped links pass. Source removal prerequisite complete. |
| WP8.3 Machine install and sweep | O | done | final integration commit | Minimal-PATH startup/course/roadmap/routes/install checks pass; owned install inventory exact; no active TS/config or non-lab Python; historical/deferred exceptions documented. |
| WP9.1 Consolidated progress schema and migration command | F | done | ff2b69c | Schema, queries and consolidation committed together with CLI switch; final primary checks continue under WP9.2. |
| WP9.2 Switch CLI, route and roadmap to the one database; re-run parity | F | done | ff2b69c + resume acceptance | Primary shared-file test: 1130 golden outputs match across all five courses before/after init; read-only DB/WAL hashes unchanged. All baseline course rows/timestamps and 15 backup hashes match. |
| WP8.4 Final acceptance | F | in progress | | Parity/data/race/real-tool gates accepted; final tests after source retirement and cleanup pending. |

**Decision and finding log.** Append dated entries when Nick answers a question, a decision in §2
changes, or a WP discovers something later WPs must know (driver quirks, parity exceptions,
learner progress rows that changed during the work).

- 2026-09-12 — Plan drafted and revised into work packages; no user decisions recorded yet.
  Open for Nick: confirm the §2 decisions, in particular 1 (Markdown lesson source), 3 (roadmap
  database plus committed JSON snapshot), 5 (dropping compatibility spellings) and 7 (one skill).
- 2026-09-12 — Nick set the session goal "complete plan.md" without amending §2; the agent
  proceeds with every §2 decision as written. Any of them can still be reversed afterwards, but
  the work below assumes them.
- 2026-09-12 — Findings from WP0: (a) the session environment exported `GOPATH`/`GOCACHE`
  pointing into `courses/grpc/.tools/` (an ignored leftover of the gRPC lab; `~/.bashrc` unsets
  them in interactive shells). Go work uses `GOPATH=/root/go GOCACHE=/root/.cache/go-build`;
  the stray cache directory was removed. (b) The linux, postgres and sqlite learner databases hold
  lesson rows older than their `lessons.json` (postgres 95 active rows vs 92 lessons, sqlite 48 vs
  54, linux 72 with different slugs/revisions); they were never re-`init`ed after the last builds.
  The golden corpus therefore has two variants per course: `<course>/raw/` captured from the
  untouched copy (oracle for reading existing databases, gate B) and `<course>/` captured after a
  Deno `init` on a second copy (oracle for rendering from lesson files, gate A, and for seed
  parity: compare a Go `init` dump with `<course>/dump.json`, not with WP0.1's `dump.json`, which
  WP2.3 originally specified). The real databases stay untouched; re-initializing them is the
  learner's call after the migration. (c) `future-courses/linux-v2/course.md` has 44 canonical
  rows, not 66 as §B says; `courses.json` in the corpus is authoritative. (d) Deno's `lesson N
  --json` prints Markdown (only `show N --json` printed JSON); the Go `lesson N --json` prints the
  JSON, matching golden `lesson-NN.json`.
- 2026-09-12 — WP3.1 findings (package `internal/cli`): (a) `route.DiscoverCourses` fails as a
  whole when any course's catalog disagrees with its plan, so `Execute` builds the command tree
  from a non-validating course listing in that case; `courses` and the unknown-course listing
  still report the discovery error (exit 2), and `check`/`init` report the mismatch (exit 1).
  (b) A non-integer lesson number exits 2 (§3.3 usage error), where Deno exited 1; `note text is
  required`, `search text is required` and `choose one of --todo, --done` stay exit 1. (c)
  `lesson N --topic X` is rejected in both spellings (Deno ignored the flag). (d) `--ansi` on
  `route` follows Deno: the flag only, no terminal detection. (e) `tutor install --check` fails
  until WP7.1 creates `curriculum-tools/skills/tutor` (a listed source). (f) The `roadmap` view
  and `show` are styled with the Markdown styler only when stdout is a terminal.
- 2026-09-12 — WP4.2 findings (package `internal/roadmap`): (a) the §3.5 stale-export rule
  ("roadmap.json older than `exported_at`") can never fire after a mutation, because nothing
  later moves either value; the package adds a third `roadmap_meta` key, `changed_at`, stamped by
  every mutating command and by import, and the note also prints when `changed_at` >
  `exported_at`, when the file is missing, or when nothing was ever exported. (b) `export` sets
  the published file's mtime to the same instant it records as `exported_at` (the kernel's
  coarse file clock otherwise lags `time.Now()` and made a fresh export look stale). (c) A plan
  row prints only ` — plan: <path>`; the `(32 planned)` count in the §3.5 sample is dropped
  (counting a plan file's rows on every view is not worth the parse). (d) A topic linked to a
  course id that does not resolve prints ` — <course>` with no counts rather than `0/0`.
  (e) `followup choose n` is an exclusive select. (f) `schema_migrations (1, 'roadmap')` is
  recorded in `tutor.sqlite`; WP9.1 must keep that row when it adds the progress tables.
- 2026-09-12 — Nick: "add task to consolidate to one database since I believe we just have one
  approach now so a per course db doesn't seem necessary … handle that at the end." Decision 2
  (per-course `progress.sqlite`) is superseded by Phase 9 below: one `curriculum-tools/tutor.sqlite`
  holds every course's lessons/progress/attempts plus the roadmap tables. Nick left the timing
  to the agent ("at end or when you think is best"): Phase 9 runs right after WP3.6 (parity
  gate C), so WP5.2, the skill and every documentation package are written once against the
  final design; the original per-course files are kept as read-only backups until Nick removes
  them.

- 2026-09-12 — Resumed with Nick's current model mapping: S → Luna/high, O → Sol, F →
  current primary. The primary owns validation, plan updates and the hardest work. Commits
  ff2b69c and a959159 were missing from the status log; reconciled above. The existing
  uncommitted `progress.Holders` export in `consolidate.go` is preserved and not included in
  the mapping-only commit. Prior Claude attribution lines are historical, not new commit
  requirements. No separate lesson-batch handoff applies to this CLI migration.
- 2026-09-12 — Resume preflight: about 15 GB disk and 6.9 GiB RAM available, inodes 8% used;
  learner cluster read-only answer `lab|/labs/pglab/primary|f` after socket access outside the
  sandbox. Sandbox process listings do not expose the host's learner processes. Existing
  `$WORK` artifacts retained for outstanding acceptance; new resume evidence lives under
  `curriculum-tools/.cache/migration-resume/` and is removed at final acceptance. Go scratch
  build cache is `/tmp/tutor-go-build`; account for it at cleanup.

- 2026-09-12 — WP9.2 primary acceptance: `TestParitySharedDatabase` compares 1130 CLI
  outputs with all five courses in one temporary consolidated file, before and after refreshing
  all five catalogs. Differences are limited to normalizing the explicit `--db` footer path
  and JSON key order; all content/status outputs match, and read verbs leave DB/WAL unchanged.
  This complements the earlier 1145-file per-course parity run (which also included init
  output, dumps and duplicate next-lesson captures). Temporary databases are cleaned by tests.
  Resume audit `.cache/migration-resume/progress-audit.txt` proves every original lesson field,
  prerequisite, progress record and attempt (timestamps included) equals the baseline after ID
  normalization by slug. Backup main/WAL/SHM hashes all match (15/15). Counts remain
  grpc 6/6/6, linux 72/0/0, postgres 99/8/8, essentials 26/22/23, sqlite 48/0/0.
  The roadmap import had not run despite WP4.3 being committed; imported the committed snapshot
  through `tutor roadmap import` and re-audited all learner data afterwards: unchanged, with
  19 roadmap topics and 49 follow-ups now available. No learner catalogs were refreshed.

- 2026-09-12 — Nick approved the primary's refined model-to-task mapping: Sol for sensitive
  progress/concurrency/validation implementation, Luna/high for well-specified docs/mechanical
  work, primary for architecture, hard fixes, integration and independent acceptance. WP5.2's
  Luna draft is transferred to Sol with explicit ownership; WP5.3/WP6.3/WP8.3 also move to O.
  Current §0 mapping supersedes the initial blanket mapping and any historical tier assignments.

- 2026-09-12 — WP5.2 accepted: validation selectors, isolated SQLite/shell runs, cleanup/keep,
  failures and the copy-only progress verifier have focused tests and full Go vet/race acceptance.
  The verifier rejects positive-size WAL/journal, detects observed source byte/metadata changes,
  refreshes only the named course in a temporary copy, compares other-course lesson content and
  prerequisites, and checks all-course identities/progress/attempts. All five real-course verify
  reports pass (251 total lesson rows, 36 progress rows, 37 attempts), with no learner refresh.
  Evidence is in `.cache/migration-resume/{race.txt,verify-*.json}` until final acceptance.
- 2026-09-12 — WP7.4 primary review kept the historical validation README body verbatim under
  its dated note and extended the Essentials PLAN edit to its stale implementation paragraph
  only (no route/content edits). Markdown is parsed directly; there is no generated catalog.

- 2026-09-12 — WP5.3 smoke: SQLite 1 created an owned 8192-byte lab.db with `events`
  and `baseline_rows=1`; SQLite 2 reported 3.53.4, DBPAGE/DBSTAT/FTS5 capabilities, 4096-byte
  page, `dbstat_probe_rows=2`, `fts_matches=1`; SQLite 3 showed B reading A's committed row,
  A count 2 versus B count 1 during the transaction and B count 1 after rollback. Linux 2
  fallback (gRPC tools remain pruned) showed kernel 6.8.0-138-generic, Ubuntu userspace,
  `/usr/bin/bash` and `kernel_release_consistent=yes`. All outputs inspected against lessons,
  retained temporarily under `.cache/migration-resume/`; owned evidence directories removed.
  No PostgreSQL experiment ran. Nine obsolete TypeScript validation/coach files retired.

- 2026-09-12 — WP8.1 inventory extension: fifteen old Essentials validation .ts/.py
  controllers are historical tooling, not native lesson fixtures; archive their exact bytes
  with the engine and retain their original validation logs/source hashes. The five Python
  helpers under course `lab/` directories remain untouched. No converted lesson references
  the retired TypeScript or validation-controller paths. Retire the one-time Go converter
  command/test alongside the catalogs. VM/bootstrap/Docker Deno installation stays deferred
  under §8; source removal does not imply uninstalling runtimes from the machine.

- 2026-09-12 — Final sweep corrections: refreshed obsolete roadmap preamble via CLI after
  comparing all existing roadmap fields with the snapshot; re-audited all learner history.
  Updated active learner-profile language policy, archived the already-completed Linux handoff,
  and clarified `--isolated` help as file isolation. The 17 PostgreSQL reference lessons with
  `pgcoach inspect`/`hint2` prose were already unsupported by the previous Deno wrapper (its
  normalizer accepted only start/review/run/full/syntax, and its engine had no inspect/hint2).
  Preserve byte parity as Decision 10 requires; document this inherited limitation in the
  reference README and unified tutor skill rather than silently rewriting experiments or adding
  stages. Source lesson files remain byte-identical to resume commit a959159.
- 2026-09-12 — Minimal-PATH smoke and install --check pass from /tmp. The launcher now clears
  only stale GOPATH/GOCACHE values under the pruned gRPC .tools tree; unrelated overrides survive.
  Normal Go cache writes needed host permission once; installed runtime removal remains deferred.

## B. Verified current state (2026-09-12, commit 368734b)

A fresh agent should trust this table and re-verify only what a WP touches.

| Area | Today | Where to look |
| --- | --- | --- |
| Engine | Deno/TypeScript, ~1,900 lines: `curriculum-tools/src/main.ts` (usage lines 84–118, `parseArgs` 120–155, DDL 14–80, `seed` 257–330, `renderLesson` 398–442, `styleMarkdown` 444–475, `run` 486–860), `route.ts`, `types.ts`, `build.ts`, `new_course.ts`, `validator.ts`, `legacy_reading.ts` | tests in `curriculum-tools/tests/*.ts` (25 cases); run with `cd curriculum-tools && /root/.deno/bin/deno task test` |
| Lesson source | `courses/<id>/curriculum/*.ts` modules → committed `courses/<id>/lessons.json` | grpc 6, linux 72, postgres 92, postgres-essentials 26, sqlite 54 lessons = 250; JSON keys: ordinal, slug, title, category, difficulty, tags, prerequisites (ordinals), overview, syntaxBreakdown, setup?, code, expectedResult, systemsLens, challenge?, caution?, safetyLevel, runIn, sessions, minVersion, estimatedMinutes, revision |
| Lesson text facts | no `setup`/`code` contains a fence line; no prose field contains a `## ` line; prose fences: linux 9 fields, essentials 43; no `~~~` or four-backtick fences; multi-session lessons: linux 3, postgres 30, essentials 12, sqlite 16 | measured with a Deno one-liner over `lessons.json` |
| Course metadata | `courses/<id>/course.json`: id, name, description, tool, minVersion, revision, optional status (`reference` for grpc/linux/postgres/sqlite), optional `repl` {command, echo, quit, mode?, env?} | sqlite's repl runs `courses/sqlite/bin/sqlite-repl` guarded by `TUTOR_SQLITE_DB` |
| Canonical routes | `courses/postgres-essentials/PLAN.md` (40 rows), `future-courses/sqlite/course.md` (32, id `sqlite-essentials`), `future-courses/linux-v2/course.md` (66) | table header `#` / `Lesson / stable slug`; reference courses have no canonical table and use their catalogs |
| Progress | `courses/<id>/progress.sqlite` (+`-wal`, `-shm`), gitignored, WAL mode; tables `schema_migrations`, `lessons`, `lesson_prerequisites`, `progress`, `attempts` | legacy reading columns already dropped on 2026-09-12 (`docs/knowledge/school-final-refactor.md`) |
| Launchers and links | `bin/tutor` → `curriculum-tools/bin/tutor` (sh→Deno); `bin/pgcoach` → `courses/postgres/bin/pgcoach` (sh→`postgres-essentials/tools/coach.ts`); `/usr/local/bin/{tutor,pgcoach,systemscoach}` symlinks; skills symlinked in `~/.codex/skills` and `~/.claude/skills` (`curriculum-author`, `postgres-tutor`, `sqlite-tutor`, `linux-tutor`, `grpc-tutor`, `systemscoach`; `~/.claude/skills/pg-systems-tutor` is dangling; `update-knowledge-store` is unrelated and must stay) | installer `scripts/school-links.py` + `_test.py` |
| Per-course tools | `tools/validate.ts`, `courses/sqlite/tools/{validate-course,verify-progress}.ts`, `courses/postgres/tools/coach.ts`, `courses/postgres-essentials/tools/coach.ts` (+ tests); Essentials `lab/*.py` and `courses/grpc/lab` are lesson fixtures, not tooling | |
| Systemscoach | `systems-projects/`: Go stdlib CLI `cmd/systemscoach/main.go` (378 lines; `writeReceipt` and `decode` are the scavenge targets) + `main_test.go` (10 tests), launcher `bin/systemscoach`, `install.sh`, `go.mod` (module `systemscoach`, go 1.24), docs, knowledge store, skill, templates, project `projects/cursor-git` (8-lesson route, 3 authored, Go lab `lab/cursor/*.go` ~800 lines), learner receipt `.state/done/cursor-git/objects-before-refs/1.json` (2026-09-10T01:53:22Z) | `docs/knowledge/systemscoach.md` describes it |
| Roadmap | `docs/learning_path.md` (312 lines; 11 main topics, 4 workshops, 4 branches, 49 follow-up bullets), `docs/learning_path-reference.md` (663 lines of research) | linked from `docs/README.md`, `docs/articles/README.md`, `docs/learner-profile.md` |
| Archive | `archive/course-history/`, `archive/legacy-reading/` with `archive/README.md` index | new trees go beside them |
| VM | 24 GB disk, 15 GB free; 7.9 GB RAM, ~6.8 GB available; `/root/disk-usage-report.md` is a historical inventory from 2026-09-05 | learner cluster verified answering on port 5440 |

## 0. How this plan is meant to be executed

**Delegation tiers.** Current task risk determines the model, even when an older work package
was fully specified. Completed assignments below remain historical provenance.

| Tier | Model | Task fit |
| --- | --- | --- |
| S | `gpt-5.6-luna`, reasoning `high` | Bounded documentation, reference/link cleanup, mechanical conversion and edits with explicit acceptance criteria. Escalate ambiguous behavior to the primary. |
| O | `gpt-5.6-sol` | Implementation involving learner progress/data preservation, concurrency, validation correctness, or operational retirement/install checks; directed writing requiring substantial judgment. |
| F | Current primary agent | Architecture, hardest implementation and fixes, integration, independent validation, final acceptance, commits and keeping this plan current. |

**Current assignment policy (Nick, 2026-09-12, refined during resume).** Use Sol for sensitive
implementation and Luna/high for well-specified documentation and mechanical edits. The earlier
blanket Sonnet → Luna/high and Opus → Sol mapping is superseded for unfinished work. An explicit
specification alone does not make progress or validation code a Luna task. Subagents have exclusive
file ownership, run their scoped checks and report without committing. The primary independently
reviews and validates every result, handles unresolved difficult cases, and updates this plan.

Active remaining assignments:

- Sol: WP5.2 validation/progress verification, WP5.3 real-tool smoke and retirement, WP6.3 tool
  retirement, WP7.1–7.2 directed skills/guidance, WP8.3 machine install and reference sweep.
- Luna/high: WP5.4 validation documentation, WP7.3–7.4 authoring/repository documentation,
  WP8.1 mechanical archive/removal after primary approval of the accepted file inventory, WP8.2
  knowledge cleanup. Primary executes irreversible retirement only after checking preservation.
- Primary: WP8.4 final audit/cleanup and every remaining difficult correction or integration.

**Final pass on every WP.** The primary agent reviews each completed WP before commit using the
generic checklist below plus the WP's *Review focus* line. Nothing is committed unreviewed.

Generic review checklist (applied to every WP):

1. Owned files only: `git status` shows changes only in the WP's *Owns* list.
2. `gofmt -l` empty, `go vet ./...` clean, `go test -race ./...` green from `curriculum-tools/`.
3. No read path writes: run the WP's read-only commands against a copied database and confirm
   the copy's bytes are unchanged (`sha256sum` before/after).
4. Every exact string in the WP's *Output contract* is reproduced (diff against the golden corpus
   where one exists).
5. The report names what was **not** verified.
6. Working files live under `$WORK` (see the resume protocol), never in the repository; owned temp labs are gone.

**Shared rules for all agents.** Go 1.26 at `/usr/local/bin/go`. Only two third-party modules are
allowed: `github.com/spf13/cobra` and `modernc.org/sqlite`. No cgo. Tests use `t.TempDir()`; no
test may open a file under `curriculum-tools/courses/*/progress.sqlite`. Never run anything against
the learner's PostgreSQL on port 5440. Never edit `progress.sqlite` by hand. Commit only when the
WP says so, staging only owned files, message in the imperative, ending with the attribution lines
the session provides. Update the status log in this file (§A) in the same commit as each WP; there is no separate handoff file.

## 1. Goals (Nick's request, 2026-09-12)

1. All CLI logic in Go with Cobra; retire the Deno/TypeScript engine, Python installer and
   per-course wrappers.
2. One CLI: `tutor <course> route`, `tutor <course> [N] lesson`, `tutor <course> N done`.
   `pgcoach`, `systemscoach` and the sqlite course CLI go away.
3. Retire the systemscoach tool; archive its writing and docs; scavenge useful Go.
4. Agent guidance says Go is the default language for building course material; Bash where
   necessary.
5. `tutor roadmap` shows the overall learning roadmap from the database, replacing
   `docs/learning_path.md`.
6. A recorded checklist to remove outdated knowledge afterwards (§6).

Standing constraints from `AGENTS.md`: preserve learner progress and the live `/labs/pglab`
cluster, stable lesson identities, no hand edits to progress, cleanup at checkpoints, durable
findings into `docs/knowledge/`.

## 2. Decisions (override before WP0.1 if you disagree)

1. **Lesson source = one Markdown file per lesson**, `courses/<id>/lessons/NN-<slug>.md`, in the
   grammar of §3.1. Go parses it directly; there is no generated catalog and no build step.
   `tutor <course> check` replaces `deno task build`. The converter reads the already evaluated
   `lessons.json`, so no TypeScript ever runs again. Verified facts that make this safe: no
   `setup`/`code` field in any of the 250 lessons contains a fence line; no prose field contains
   a line starting with `## `; 52 prose fields contain fenced blocks (parser must track fences).
2. **One `curriculum-tools/tutor.sqlite` for all course progress and roadmap**, opened with
   `modernc.org/sqlite`. Phase 9 supersedes the original per-course design; the original files
   are retained under `.cache/legacy-progress/<id>/` as backups.
3. **Roadmap in `curriculum-tools/tutor.sqlite`** (gitignored) with a committed
   `curriculum-tools/roadmap/roadmap.json` snapshot for bootstrap/backup (`import`/`export`).
4. **Cobra tree with one command per discovered course**; `[N] verb` is normalized to
   `verb [N]` before Cobra sees the arguments.
5. **Compatibility spellings dropped**: `pretty`, `show`, pgcoach aliases, `--reference`,
   `migrate`, `restore`, `seed`.
6. **Thin sh launcher** `bin/tutor` builds (cached) and execs the binary; it is the sanctioned
   Bash exception because a copied binary cannot locate the checkout.
7. **One `tutor` skill** replaces the four course skills and the systemscoach skill;
   `curriculum-author` stays.
8. **Go module in `curriculum-tools/`** (`go.mod` module path `skills-tools/tutor`); directory
   name unchanged to avoid link churn.
9. **Systemscoach's learner-work norm is kept** as `docs/knowledge/learner-work.md`.
10. **Lesson content is untouched.** Conversion is representation only; parity gates enforce it.

## 3. Specifications shared by all work packages

### 3.1 Lesson file grammar (`courses/<id>/lessons/NN-<slug>.md`)

```text
# <title>                                   line 1, exactly "# " + title

slug: <kebab>                               header block: one "key: value" per line, no blank lines
category: <text>                            inside it; ends at the first blank line
difficulty: beginner|intermediate|advanced
tags: a, b, c                               comma+space separated; may be empty ("tags:")
prerequisites: slug-a, slug-b               optional line; earlier slugs only
safety: read-only|writes-data|ddl|locking|privileged|dangerous
run-in: tool|shell|mixed
sessions: 1..4
min-version: <string>
minutes: <int ≥ 1>
revision: <int ≥ 1>

## Overview                                 required
<markdown>

## Syntax breakdown                         required
<markdown>

## Caution                                  optional
<markdown>

## Setup                                    optional; body is exactly one fenced block
```<lang>
<verbatim>
```

## Run                                      required; body is exactly one fenced block
```<lang>
<verbatim>
```

## Expected result                          required
<markdown>

## Systems lens                             required
<markdown>

## Optional variation                       optional
<markdown>
```

Rules:

- **Ordinal** = the integer prefix of the filename (`NN-` zero-padded to 2 digits; `100-` and up
  use 3). Filename slug must equal header `slug`. `LoadLessons` sorts by ordinal and requires
  1..n consecutive.
- **Header**: unknown keys, duplicate keys, missing required keys (all except `prerequisites`)
  and malformed values are errors that name the file and key. Values are trimmed. `tags` and
  `prerequisites` split on `,` then trim; empty entries dropped.
- **Sections**: a section starts at a line that is exactly `## <Name>` for a known name and is
  **not inside a fence**. Fence tracking: a line whose leading run is three or more backticks
  opens a fence with that length; the fence closes at the next line whose leading run of
  backticks is at least that length (tilde fences are not used and are rejected in Setup/Run;
  in prose they are treated as text). Unknown `## ` headings at fence depth zero, duplicate
  sections and missing required sections are errors. Section body = lines between headings with
  leading and trailing blank lines removed and trailing whitespace stripped (this reproduces
  `types.ts` `trim`).
- **Setup/Run bodies**: after trimming blank lines the body must be a fence line, content, fence
  line, and nothing else. Content is taken verbatim (no trimming of inner lines) with the final
  newline removed. The fence language is ignored on read. The writer uses the same language the
  renderer prints (`sql` for psql/sqlite3/duckdb tool mode, `sh` for shell, `text` for mixed,
  otherwise the tool name) and a fence length of `max(3, longest leading backtick run in
  content + 1)`.
- **Prose bodies** are stored verbatim and may contain fences and `###` headings.
- **Field mapping** to the existing `Lesson` type: Overview→`overview`, Syntax
  breakdown→`syntaxBreakdown`, Caution→`caution`, Setup→`setup`, Run→`code`, Expected
  result→`expectedResult`, Systems lens→`systemsLens`, Optional variation→`challenge`;
  `safety`→`safetyLevel`, `run-in`→`runIn`, `min-version`→`minVersion`,
  `minutes`→`estimatedMinutes`.
- **Validation** (port of `validateLessons`): unique slugs and ordinals; slug and tags match
  `^[a-z0-9]+(-[a-z0-9]+)*$`; no repeated tag; difficulty/safety/run-in in their sets; sessions
  1..4; minutes ≥ 1; revision ≥ 1; prerequisites resolve to earlier ordinals and do not repeat;
  non-empty title, overview, syntaxBreakdown, code, expectedResult, systemsLens, category,
  minVersion.
- **Round-trip guarantee**: `Parse(Format(lesson)) == lesson` for every lesson in the five
  existing catalogs (byte-equal string fields). This is tested, not assumed.

### 3.2 Go package layout and public API

```text
curriculum-tools/
  go.mod                       module skills-tools/tutor
  cmd/tutor/main.go            calls cli.Execute(os.Args[1:], os.Stdout, os.Stderr) and exits with its code
  internal/course/             Course, Repl, Lesson, LoadCourse, ListCourses, LoadLessons, ParseLessonFile, FormatLessonFile, Validate
  internal/route/              ParseCanonical, LocatePlan, ReadPlan, ValidateRouteCatalog, DiscoverCourses, LoadRoute, RenderRoute
  internal/progress/           Open, EnsureSchema, Seed, and the operations of §3.4
  internal/render/             RenderLesson, StyleMarkdown, LessonJSON, list/topics/modules/status/search line formatters
  internal/roadmap/            schema, Import, Export, View, Show, Set, Add, Edit, Move, Remove, FollowupAdd/Choose/Remove
  internal/harness/            Repl, Session, SplitSteps, Validate (port of validator.ts)
  internal/links/              Plan, Check, Install (port of school-links.py)
  internal/fsutil/             PublishOnce (atomic no-replace publish), DecodeStrict (JSON), CopySQLite (db+wal+shm)
  internal/cli/                cobra tree, NormalizeArgs, course command factory, Execute
  internal/testutil/           fixture course builder used by all packages' tests
```

Types (exact field sets; JSON tags match today's `course.json` and `lessons.json` names):

```go
package course
type Repl struct { Command []string `json:"command"`; Echo string `json:"echo"`; Quit string `json:"quit"`; Mode string `json:"mode,omitempty"`; Env map[string]string `json:"env,omitempty"` }
type Course struct { ID string `json:"id"`; Name string `json:"name"`; Description string `json:"description"`; Status string `json:"status,omitempty"`; Tool string `json:"tool"`; MinVersion string `json:"minVersion"`; Revision int `json:"revision"`; Repl *Repl `json:"repl,omitempty"` }
type Lesson struct { Ordinal int; Slug, Title, Category, Difficulty string; Tags []string; Prerequisites []int; Overview, SyntaxBreakdown, Setup, Code, ExpectedResult, SystemsLens, Challenge, Caution string; SafetyLevel, RunIn string; Sessions int; MinVersion string; EstimatedMinutes, Revision int }
func LoadCourse(root, id string) (Course, error)          // root = curriculum-tools dir; rejects id not matching the slug regexp; requires course.json id == id
func ListCourses(root string) ([]Course, error)           // sorted by id; directories without a valid course.json are skipped silently
func LoadLessons(root, id string) ([]Lesson, error)       // parses lessons/*.md, resolves prerequisite slugs to ordinals, Validate
func ParseLessonFile(name string, data []byte) (Lesson, []string /*prereq slugs*/, error)
func FormatLessonFile(c Course, l Lesson, prereqSlugs []string) []byte
func Validate(lessons []Lesson) error
```

`TUTOR_ROOT` resolution (in `cli`): `--root` flag, else env `TUTOR_ROOT`, else the directory
containing the executable's `../courses` (for `go run` fallback), else error
`tutor: cannot locate curriculum-tools; set TUTOR_ROOT`.

### 3.3 CLI grammar, exit codes, output contract

```text
tutor                                  usage, exit 0
tutor courses [--json]
tutor roadmap [--json] [--followups]
tutor roadmap show <slug>
tutor roadmap set <slug> [--status planned|active|done|deferred] [--note TEXT]
tutor roadmap add <slug> --track main|workshop|branch --title T --tool T --goals T [--after <slug>] [--diagram-file PATH]
tutor roadmap edit <slug> [--title T] [--tool T] [--goals T] [--diagram-file PATH] [--course ID] [--plan PATH]
tutor roadmap move <slug> --after <slug>|--first
tutor roadmap remove <slug>
tutor roadmap followup add <topic> --title T --description T | choose <topic> <n> | remove <topic> <n>
tutor roadmap import [--file PATH] [--replace]     default file curriculum-tools/roadmap/roadmap.json
tutor roadmap export [--file PATH]
tutor new-course <id> "<Name>" <tool> "<description>" [minVersion]
tutor install [--check] [--bin-dir DIR] [--codex-skills DIR] [--claude-skills DIR]
tutor version

tutor <course> route [--json]
tutor <course> [N] lesson [--topic TEXT] [--ansi|--plain]
tutor <course> N done [--note TEXT]
tutor <course> next [--topic TEXT] [--json]
tutor <course> undone N
tutor <course> skip N [--note TEXT]
tutor <course> note N TEXT...
tutor <course> list [--todo|--done|--all] [--category NAME] [--topic TEXT] [--limit N] [--json]
tutor <course> modules [--json]
tutor <course> topics [--json]
tutor <course> status [--json]
tutor <course> search TEXT... [--json]
tutor <course> init [--db PATH]
tutor <course> check
tutor <course> validate [--from N] [--to N] [--timeout MS] [--isolated] [slug|N ...]
tutor <course> progress verify
```

- `--db PATH` is a persistent flag on every course command; relative paths resolve against the
  working directory; default `courses/<id>/progress.sqlite`.
- **Argument normalization** (`cli.NormalizeArgs`): if `args[1]` matches `^[1-9]\d*$` then
  `len(args)` must be 3 (plus flags) and `args[2]` ∈ {`lesson`,`done`}; rewrite to
  `[course, verb, N]`. Otherwise error `use tutor <course> NUMBER lesson|done` (exit 2).
  `--topic` with a number → `--topic selects the next lesson and cannot be combined with NUMBER`
  (exit 2). `--ansi` with `--plain` → `--ansi and --plain cannot be used together` (exit 2).
- **Exit codes**: 0 success; 2 usage/parse errors, unknown course, `lesson N not found`,
  `route`/`courses` failures; 1 other runtime errors. Errors go to stderr as `Error: <message>`.
- **Plan-only courses** (from `future-courses/*/course.md`) accept only `route`; any other verb
  → `Error: course '<id>' is planned, not implemented; only route is available` (exit 2).
- **Read-only guarantee**: `route`, `courses`, `check`, `roadmap` (view/show), `lesson`, `next`,
  `list`, `modules`, `topics`, `status`, `search` never create or modify a database. `route` and
  `courses` work without any database. The others require an initialized database and fail with
  `progress database is not initialized; run 'tutor <course> init'` (exit 1) if not.

Exact output strings (all must match the Deno engine byte-for-byte; they are the parity oracle):

```text
lesson (Markdown):
  # Lesson {ordinal}: {title}
  <blank>
  **Meta:** {category} | {difficulty} | ~{minutes} min | run in {runIn}{sessions} | {safety}␣␣
  **Topics:** {tags joined ", "}␣␣                      (line present only when tags non-empty)
  Lesson ID: {ordinal}
  <blank>
  ## Overview\n{overview}
  <blank>
  ## Syntax breakdown\n{syntaxBreakdown}
  ## Caution\n{caution}                                  (if non-empty)
  ## Setup\n```{lang}\n{setup}\n```                       (if non-empty)
  ## Run\n```{lang}\n{code}\n```
  ## Expected result\n{expectedResult}
  ## Systems lens\n{systemsLens}
  ## Optional variation\n{challenge}                     (if non-empty)
  ## Your note\n{notes}                                  (if non-empty)
  When you consider it complete: `tutor {course} {ordinal} done{flags}`.
  — sections joined by "\n\n"; runIn = tool→course.tool, shell→"shell", mixed→"{tool} + shell";
    sessions = ", {n} {tool} sessions" when n>1 else ""; lang = shell→sh, mixed→text,
    tool→sql if tool ∈ {psql,sqlite3,duckdb} else tool; flags = " --db '" + raw --db value with
    ' replaced by '\'' + "'" when --db was given, else "".
lesson --json (key order): ordinal, slug, title, category, difficulty, tags, status, sessions,
  runIn, safetyLevel, minVersion, estimatedMinutes, overview, syntaxBreakdown, caution?, setup?,
  code, expectedResult, systemsLens, challenge?, notes?   — "?" keys omitted when empty;
  status is "stale" when done at an older revision, else todo|done|skipped. Two-space indent.
route: "# {name} — {n} lessons, {completed} done\n\n[done] marks completion of the current lesson revision; planned lessons are not yet available.\n\n"
       then lines "{ordinal}. {[done] |[revisit] |}{title} — {available|planned}" joined "\n"
route --json: {"id","name","lessons":[{"ordinal","slug","title","available","done","stale"}]}
courses: "{id} — {name} [{status}] · {available}/{total} available\n  tutor {id} route" joined "\n\n", else "No courses found."
courses --json: array of {id,name,description,tool?,status,implemented,planned,authored,available,total,planPath?} sorted by id
list: "{ordinal:>3}  {status:<7} [{category}] {title}{ (N sessions)}{  {tag,tag}}" ; status shows "stale" when stale; empty → "No lessons found."
topics: "{tag:<28} {done:>2}/{total:<3} done  lessons {1,4,9}" sorted by first ordinal; empty → "No topics tagged yet."
topics --json: [{"tag","first","total","done","lessons"}]
modules: "{first:>3}-{last:<3} {category:<26} {done}/{total} done  ~{minutes} min"
modules --json: [{"category","first","last","total","done","minutes"}]
status: "{name}: {done}/{total} done; {todo} remaining; {skipped} skipped; {stale} stale."
status --json: {"course","total","done","todo","skipped","stale"}
search: "{ordinal:>3}  [{category}] {title}" ; empty → "No lessons found."
next/lesson with nothing left: "All active lessons are complete." (json: {"complete":true})
--topic with no match: "No lessons match topic '{topic}'. Run 'tutor {id} topics' to see the vocabulary, or 'search'." (json {"topic","matched":0})
--topic all complete: "All {n} lessons matching topic '{topic}' are complete." (json {"topic","matched":n,"complete":true})
done/skip: "Lesson {N} marked done." / "Lesson {N} marked skipped."
undone: "Lesson {N} marked todo."
note: "Note saved for lesson {N}."
init: "Initialized {count} {course name} lessons in {absolute db path}"
missing lesson: Error: lesson {N} not found   (exit 2)
```

`StyleMarkdown` (applied when `--ansi`, or stdout is a terminal and not `--plain`): process line
by line; strip two trailing spaces; lines starting with ``` toggle code mode and print dim; code
lines print in cyan (`\x1b[36m`); `# `/`## `/`### ` headings print the text in `\x1b[1;36m` /
`\x1b[1;33m` / `\x1b[1;32m`, and `## ` adds a new line of 72 `─` in dim; `**x**` → bold/unbold
(`\x1b[1m`…`\x1b[22m`); leading `- ` → magenta `•`; reset is `\x1b[0m`, dim `\x1b[2m`.

### 3.4 Progress database (unchanged DDL and semantics)

DDL is copied verbatim from `src/main.ts` (`schema_migrations`, `lessons`, `lesson_prerequisites`,
`progress`, `attempts`, three indexes). Open with
`PRAGMA foreign_keys=ON; busy_timeout=5000; journal_mode=WAL; synchronous=NORMAL`. `EnsureSchema`
runs the `CREATE TABLE IF NOT EXISTS` statements; existing databases already have every column, so
no ALTER is needed (the legacy reading columns were dropped on 2026-09-12; `EnsureSchema` must
error clearly if `PRAGMA table_info(lessons)` still shows `reading`, `reading_notes` or
`study_checkpoint`, telling the user to run the archived Deno `migrate` first).

`Seed(db, lessons)` — exact algorithm from `seed()`:

1. `BEGIN IMMEDIATE`.
2. Read `id, ordinal, slug` of all existing rows; `idBySlug`; `nextId = max(id)`;
   `offset = max(len(lessons), max(existing ordinal), 0) + 1`.
3. `UPDATE lessons SET active=0, ordinal=offset+id` (parks every row out of the way).
4. For each lesson in ordinal order: `id = idBySlug[slug]` or `++nextId`; upsert all columns
   with `ON CONFLICT(id) DO UPDATE` setting every content column, `active=1`,
   `updated_at=strftime(...)`. Tags are stored as `,a,b,` (leading and trailing comma; `,` for
   none).
5. `DELETE FROM lesson_prerequisites`; insert `(lesson_id, prerequisite_id)` by ordinal→id map.
6. Retired rows (`active=0`) are re-parked at ordinals `len(lessons)+1, +2, …` in id order.
7. `COMMIT`; return count.

Operation SQL (port verbatim; `LESSON_SELECT` = `SELECT l.*, COALESCE(p.status,'todo') AS status,
p.notes AS notes, CASE WHEN p.status='done' AND p.completed_revision<>l.revision THEN 1 ELSE 0 END
AS stale FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id`):

- `getLesson(ordinal)`: `… WHERE l.ordinal=? AND l.active=1`.
- unfinished predicate: `(p.lesson_id IS NULL OR p.status='todo' OR (p.status='done' AND p.completed_revision<>l.revision))`.
- topic filter: every whitespace-separated lowercased word must `LIKE %word%` against
  `lower(l.tags || ' ' || l.category || ' ' || l.title)`; empty → error `--topic requires at least one word`.
- `done`/`skip`: in one `BEGIN IMMEDIATE` transaction, upsert `progress` (`status`,
  `completed_revision` = lesson revision for done else NULL, `completed_at` = RFC3339 UTC now
  with milliseconds for done else NULL, `notes` = `--note` or keep existing when the new note is
  empty), then insert `attempts(lesson_id,'manual',revision,notes)`.
- `undone`: `UPDATE progress SET status='todo', completed_revision=NULL, completed_at=NULL, updated_at=… WHERE lesson_id=?`.
- `note`: upsert `progress(lesson_id,'todo',notes)` updating notes only; empty text → error `note text is required`.
- `list`: `--done` = `p.status='done' AND p.completed_revision=l.revision`; `--todo` = unfinished;
  `--all`/none = no status filter; `--category` exact match; `--topic`; `--limit` default 1000;
  more than one of `--todo/--done/--all` → error `choose one of --todo, --done`.
- `topics`, `modules`, `status`, `search`: SQL exactly as in `main.ts` lines 730–850 (search
  haystack: title, overview, systems_lens, code, category, slug, tags; every term `LIKE`).

### 3.5 Roadmap: JSON snapshot and database

`curriculum-tools/roadmap/roadmap.json` (committed):

```json
{
  "format": 1,
  "preamble": "Markdown paragraph(s) shown at the top of `tutor roadmap`",
  "topics": [
    {
      "slug": "postgresql", "title": "PostgreSQL", "track": "main",
      "status": "active", "tool": "A client/server relational database with MVCC, WAL, indexes and replication.",
      "goals": "Build depth in transactions, storage, recovery and query behavior; …",
      "diagram": "request -> COMMIT -> reply lost\nretry   -> operation ID -> existing result",
      "course": "postgres-essentials", "plan": "", "notes": "",
      "followups": [
        {"title": "Retryable command", "description": "drop a post-commit response; …", "chosen": false}
      ]
    }
  ]
}
```

Array order is the position within a track. `track` ∈ main|workshop|branch, `status` ∈
planned|active|done|deferred. `course` is an installed course id or empty; `plan` is a
repository-relative path or empty. Unknown keys are rejected (`DecodeStrict`).

Database (`curriculum-tools/tutor.sqlite`), created on first roadmap write:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))) STRICT;
CREATE TABLE IF NOT EXISTS roadmap_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;            -- preamble, exported_at
CREATE TABLE IF NOT EXISTS roadmap_topics (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('main','workshop','branch')), position INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','active','done','deferred')),
  tool TEXT NOT NULL, goals TEXT NOT NULL, diagram TEXT NOT NULL DEFAULT '',
  course_id TEXT NOT NULL DEFAULT '', plan_path TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (track, position)) STRICT;
CREATE TABLE IF NOT EXISTS roadmap_followups (
  id INTEGER PRIMARY KEY, topic_id INTEGER NOT NULL REFERENCES roadmap_topics(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
  chosen INTEGER NOT NULL DEFAULT 0 CHECK (chosen IN (0,1)), UNIQUE (topic_id, position)) STRICT;
```

`tutor roadmap` output contract:

```text
# Learning roadmap
<blank>
{preamble}
<blank>
## Main path
 1. [active]   PostgreSQL — postgres-essentials: 26/40 authored, 13 done
 2. [planned]  SQLite — plan: future-courses/sqlite/course.md (32 planned)
 3. [planned]  Docker / container internals
…
## Supporting workshops
…
## Optional branches
…
<blank>
Show a topic: tutor roadmap show <slug>   (goals, diagram, optional Go follow-ups)
```

Status is left-padded inside brackets to width 8 (`[active]  ` → `[active]` + spaces so titles
align). Course counts come from the linked course's progress database opened read-only (missing
database → `0 done`); `authored` = number of lesson files, total = canonical route length.
`--followups` appends the follow-up bullets under each topic. `show <slug>` prints title, track,
status, tool, goals, the diagram inside a ```text fence, linked course or plan, notes, and the
follow-ups numbered with `[x]` for chosen. Every mutating roadmap command prints the affected
row in the `show` format and, if `roadmap.json` is older than the database's `exported_at`,
ends with `Note: run tutor roadmap export to update roadmap.json`.

### 3.6 Golden parity procedure

Produced once by WP0.2 from the **Deno** engine and reused by WP1.4, WP2.4, WP3.6:

```text
$WORK/golden/<course>/
  db/progress.sqlite (+ -wal, -shm)     byte copies of the learner database, copied while no tutor process runs
  lesson-NN.md                          tutor <course> NN lesson --plain --db $WORK/golden/<course>/db/progress.sqlite
  lesson-NN.json                        tutor <course> show NN --json --db …          (Deno-only spelling; Go uses `lesson NN --json`)
  route.txt / route.json                tutor <course> route [--json] --db …
  status.json, list-all.json, topics.json, modules.txt, modules.json, search-vacuum.txt
$WORK/golden/courses.txt, courses.json
$WORK/golden/next-<course>.md        tutor <course> lesson --plain --db …   (next unfinished)
```

The Go runs use the identical `--db` path so the lesson footer matches byte-for-byte. A gate
passes when `diff -r` over the corpus is empty after JSON key-order normalization (`jq -S`).
Baseline hashes of the real databases are recorded before and after every gate.

## 4. Work packages

Dependencies are listed; packages without a shared dependency may run in parallel. Each package
lists *Owns* (the only paths it may change), *Deliverables*, *Steps*, *Tests*, *Acceptance*,
*Report* and *Review focus* (what the primary checks in the final pass).

### Phase 0 — Baselines (no repository code changes except handoff)

**WP0.1 — Resource preflight and progress baseline** · tier S · depends: none

- Owns: nothing in the repository; writes only to `$WORK/baseline/`.
- Steps: read `/root/disk-usage-report.md` and `docs/knowledge/vm-resource-cleanup.md`; run
  `df -h /`, `free -m`; confirm no `tutor`/`deno`/`pgcoach` process is running (`pgrep -af
  'deno|tutor|pgcoach'`); for each of the five courses copy `progress.sqlite`, `-wal`, `-shm`
  (when present) to `$WORK/baseline/<course>/`; record `sha256sum` of the originals; produce a
  logical dump per course with
  `sqlite3 -readonly $WORK/baseline/<course>/progress.sqlite ".mode json" "SELECT id,ordinal,slug,revision,active FROM lessons ORDER BY id" "SELECT * FROM progress ORDER BY lesson_id" "SELECT * FROM attempts ORDER BY id"`
  into `dump.json`; copy `systems-projects/.state/done/**` to `$WORK/baseline/systemscoach/`;
  query the learner cluster read-only with the existing sanctioned form
  (`psql -h /tmp -p 5440 -U postgres -d lab -Atc "select current_database(), current_setting('data_directory'), pg_is_in_recovery()"`).
- Acceptance: `$WORK/baseline/README.txt` lists free disk/memory, the five hashes, row counts
  per table, the cluster answer, and the time.
- Report: those numbers. Review focus: hashes were taken from the originals, not the copies.

**WP0.2 — Golden corpus from the Deno engine** · tier S · depends: WP0.1

- Owns: `$WORK/golden/` only.
- Steps: write `$WORK/golden/make.sh` implementing §3.6 exactly, using
  `/root/.deno/bin/deno run --allow-read --allow-write curriculum-tools/src/main.ts` (never the
  installed launcher), and copies of the databases from WP0.1 placed at the §3.6 `db/` paths.
  Loop ordinals 1..n where n comes from `route.json`'s `available` entries. Also capture
  `search-vacuum.txt` from `search vacuum` and `next-<course>.md`. Tar the corpus and record its
  SHA256 in the README.
- Acceptance: every course has n lesson files; `courses.json` lists 5 implemented and 2 planned
  courses; re-running `make.sh` reproduces identical files (`diff -r`).
- Report: counts per course, corpus SHA256. Review focus: every capture used `--db` on the copy;
  original hashes from WP0.1 unchanged afterwards.

**WP0.3 — Module bootstrap and handoff** · tier F

- Delete the stale root `handoff.md` (Essentials batch of 2026-09-06, already complete); create
  `go.mod` (`module skills-tools/tutor`, `go 1.26`), `cmd/tutor/main.go` printing `tutor dev`,
  `go get github.com/spf13/cobra@latest modernc.org/sqlite@latest`, `go build ./...`. If the
  module proxy is unreachable, `go mod vendor` and commit `vendor/`. Record the module versions,
  `$WORK` contents and corpus SHA in §A. Commit: "Start Go tutor module and migration plan".

### Phase 1 — Lesson source in Markdown

**WP1.1 — `internal/course`: grammar parser, writer, validation** · tier F · depends: WP0.3

- Implements §3.1 and the `course` API of §3.2, plus `internal/testutil` (a builder that writes
  a fixture course with `course.json` and N lesson files into a `t.TempDir()`).
- Tests: round-trip on synthetic lessons covering every optional field, nested fences in prose,
  a `Run` body containing a line of four backticks (writer must use five), CRLF rejection,
  unknown key, duplicate section, missing required section, bad slug, forward prerequisite,
  ordinal gap, filename/slug mismatch.
- Commit: "Add Go lesson file parser and course loader".

**WP1.2 — Converter and conversion of the five courses** · tier S · depends: WP1.1

- Owns: `internal/cli/convert_legacy.go` (hidden command `tutor convert-legacy <course>`),
  `courses/*/lessons/`, one test file.
- Steps: read `courses/<id>/lessons.json` with `DecodeStrict` into `[]course.Lesson`
  (`prerequisites` are ordinals there; map to slugs for the writer); write
  `lessons/NN-<slug>.md` with `FormatLessonFile`; refuse to run if `lessons/` already exists.
  Run it for grpc, linux, postgres, postgres-essentials, sqlite.
- Tests: a table test that, for each of the five courses, loads `lessons.json` and
  `LoadLessons` and asserts `reflect.DeepEqual` per lesson (this test is deleted in WP8.1 with the
  JSON; note that in the file header).
- Acceptance: `go test ./internal/cli -run Convert` green; `ls courses/postgres/lessons | wc -l`
  = 92, linux 72, sqlite 54, postgres-essentials 26, grpc 6; `git diff --stat` touches only
  `lessons/` directories plus the two Go files.
- Commit per course: "Convert <course> lessons to Markdown source" (five commits), then the
  converter commit. Review focus: spot-read three converted files per course against
  `lessons.json`; confirm no content line changed (`diff <(jq -r '.[3].code' lessons.json) <(…)`).

**WP1.3 — `internal/render`** · tier S · depends: WP1.1

- Owns: `internal/render/*`.
- Deliverables: `RenderLesson(c course.Course, l course.Lesson, notes, dbFlag string) string`,
  `LessonJSON(l, status, notes) ([]byte, error)` (ordered keys via a struct with `omitempty`),
  `StyleMarkdown(string) string`, `RenderRoute(route.Route) string`, and the line formatters for
  list/topics/modules/status/search/courses — every format in §3.3 verbatim.
- Tests: one golden test per format using a fixture lesson whose expected strings are copied
  from `$WORK/golden` (paste the literal expected text into the test); `StyleMarkdown`
  against a hand-written 12-line sample covering every rule.
- Acceptance: tests green. Commit: "Add lesson and route renderers". Review focus: two trailing
  spaces on meta lines; `Lesson ID:` line; the `notes` section; `--db` quoting.

**WP1.4 — Parity gate A (render from files)** · tier S · depends: WP1.2, WP1.3

- Owns: `$WORK/parity-a/` and a temporary hidden command `tutor render-check <course> <N>`
  in `internal/cli` (deleted in WP3.6) that renders lesson N from files with status `todo` and no
  notes, plus `--json`.
- Steps: for every course and ordinal produce `lesson-NN.md` via `render-check` with the same
  `--db` string used in the golden run, and diff against `$WORK/golden`. Expect exact
  equality except the `## Your note` section and the `status` JSON field, which depend on
  progress and are compared in WP2.4 instead (strip those before diffing and say so in the
  report).
- Acceptance: empty diff for 250 lessons. Report: per-course counts, any stripped sections.
  Review focus: the diff command really ran on all files (show `wc -l` of the file list).

**WP1.5 — Course template and check rules doc** · tier S · depends: WP1.1

- Owns: `templates/course/lessons/01-example.md`, `templates/course/course.json`,
  delete `templates/course/curriculum/`, `templates/course/skill/`.
- The example lesson must parse (`LoadLessons` on the template directory in a test) and shows
  every section with one-line placeholder text using the §3.1 names. Commit: "Replace course
  template with Markdown lesson example".

### Phase 2 — Progress engine

**WP2.1 — `internal/progress`: schema, open, seed** · tier F · depends: WP1.1

- Implements §3.4 `Open`, `EnsureSchema` (with the legacy-column guard), `Seed`,
  `CopySQLite` in `fsutil`. Tests: init idempotence; identity across reorder/removal/reinsertion
  (port of the Deno test at `tests/main_test.ts:232` — same fixture: three lessons, reorder,
  remove one, reinsert, assert ids and parked ordinals); stale detection after revision bump;
  running `Seed` on a copy of each real database (from `$WORK/baseline`) leaves
  `progress` and `attempts` byte-identical and `lessons` identical except `updated_at`.
- Commit: "Add Go progress schema and identity-preserving seed".

**WP2.2 — Progress operations** · tier S · depends: WP2.1

- Owns: `internal/progress/ops.go`, `ops_test.go`.
- Deliverables (signatures):
  `Get(db, ordinal) (Row, error)`, `Next(db, topic string) (Row, matched int, complete bool, error)`,
  `Done(db, ordinal, note) error`, `Skip(db, ordinal, note) error`, `Undone(db, ordinal) error`,
  `Note(db, ordinal, text) error`, `List(db, ListFilter) ([]Row, error)`,
  `Topics(db) ([]Topic, error)`, `Modules(db) ([]Module, error)`, `Status(db) (Status, error)`,
  `Search(db, terms []string) ([]Row, error)`, `EnsureReady(db) error`, where `Row` carries every
  lesson column plus `Status`, `Notes`, `Stale`. SQL verbatim from §3.4.
- Tests: port `tests/main_test.ts` cases "show, done, next, undone, skip, and status preserve
  explicit progress", "a revised lesson becomes stale and is served again", "search requires
  every term, list filters by category, modules summarizes", "topics lists tags and --topic
  serves the next unfinished matching lesson". Each assertion in those tests must have a Go
  counterpart; list them in the report.
- Commit: "Add progress operations". Review focus: `done` keeps the old note when `--note` is
  absent; `attempts` row written in the same transaction; `--topic` predicate lowercases.

**WP2.3 — Parity gate B (progress-dependent views)** · tier S · depends: WP2.2, WP3.1 (needs the
CLI) — run after WP3.1

- Owns: `$WORK/parity-b/`.
- Steps: fresh copies of the baseline databases at the golden `db/` paths; run the Go CLI for
  `route`, `route --json`, `status --json`, `list --all --json`, `topics --json`, `modules`,
  `modules --json`, `search vacuum`, `lesson N --plain` for all N, `lesson --plain` (next) and
  `lesson N --json`, and `courses` / `courses --json`; diff against golden after `jq -S`.
  Then run `init` on the copies and compare the logical dump with WP0.1's `dump.json`
  (identical except `updated_at`).
- Acceptance: empty diffs; dump comparison passes; original database hashes unchanged.
  Review focus: `next-<course>.md` matches (proves the unfinished predicate and ordering).

### Phase 3 — Cobra CLI, discovery, launcher, install

**WP3.1 — Cobra tree and course command factory** · tier O · depends: WP1.3, WP2.2, WP3.2

- Owns: `internal/cli/*` except `convert_legacy.go`, `cmd/tutor/main.go`.
- Fixed by this plan: the grammar, exit codes and messages of §3.3; `NormalizeArgs` as a pure
  function with tests for `[c,3,lesson]`, `[c,3,done]`, `[c,3,route]` (error), `[c,lesson,3]`
  (unchanged), `[c,3]` (error), flags interleaved; course commands registered dynamically from
  `route.DiscoverCourses` (installed and planned); a planned course exposes only `route`;
  persistent flags `--db --json --ansi --plain`; `--root`; usage text listing every command
  (wording is the agent's, but it must show the three learner verbs first).
- Left to the agent: how the factory shares code between verbs, help formatting, whether to use
  `cobra.ExactArgs` or manual checks, error wrapping.
- Tests: an `Execute` table test over each verb with a fixture course and temp database
  asserting stdout, stderr and exit code, including the read-only guarantee (database bytes
  unchanged after `route`, `lesson`, `list`, `status`, `search`; no file created by `route` on an
  uninitialized course).
- Commit: "Add cobra tutor CLI". Review focus: `tutor <course>` with no verb prints that
  course's help and exits 0; an unknown course prints `Error: unknown course 'x'` plus the course
  list and exits 2; `--json` on a text-only verb is rejected or ignored consistently (choose
  "rejected", exit 2).

**WP3.2 — `internal/route`** · tier S · depends: WP1.1

- Owns: `internal/route/*`.
- Port `route.ts` function-for-function: `ParseCanonical(markdown) ([]Entry, bool, error)`
  (canonical header cell `#` and `Lesson / stable slug`; separator row; fence skipping; exactly
  one backticked slug per row; title = text before the slug with `**` removed and a trailing
  `/([—–:-` stripped; consecutive ordinals; duplicate slug error; the `Canonical route line N:`
  error prefix), `LocatePlan(root, id)` (future plan whose `Course ID:` backtick value matches
  wins; more than one → `Multiple future-course plans declare <id>`; else
  `courses/<id>/PLAN.md`), `ReadPlan`, `ValidateRouteCatalog` (both mismatch messages verbatim),
  `DiscoverCourses(root)` (the `CourseDiscovery` shape of §3.3; `authored`/`available` = lesson
  file count; `status` from `course.json` else `current`; planned entries from
  `future-courses/*/course.md` with `Status:` line parsing → proposed|agreed|current|reference),
  `LoadRoute(root, id, dbPath)` (reads progress read-only **only if the file exists** and has a
  `progress` table; uses `mode=ro` in the DSN), `RenderRoute` lives in `render`.
- Tests: port `tests/route_test.ts` (three cases) and the ambiguous-identity cases; use the real
  `future-courses/sqlite/course.md` and `postgres-essentials/PLAN.md` as fixtures copied into a
  temp root to assert 32 and 40 entries.
- Commit: "Add route parsing and course discovery". Review focus: `route` on a plan-only course
  with no directory works; a stale `--db` path that does not exist does not get created.

**WP3.3 — `new-course` scaffold** · tier S · depends: WP3.1, WP1.5

- Owns: `internal/cli/new_course.go` + test.
- Behavior from `new_course.ts`: validate id; resolve plan first (duplicate future identities
  fail before any file is written); refuse an existing directory; copy `templates/course/`
  replacing `{{id}} {{name}} {{tool}} {{description}} {{minVersion}}` (JSON-escape inside
  `course.json` only); do **not** copy the example lesson into a real course (the scaffold is an
  empty `lessons/` directory with a `.gitkeep`); symlink `PLAN.md` relatively to a located plan;
  print the written paths and `Next: add lessons/01-<slug>.md, then tutor <id> check && tutor <id> init`.
- Tests: port `tests/scaffold_test.ts` cases 1 and 2 (case 3, build validation, becomes
  "`check` validates a changed plan before `init` replaces lessons").
- Commit: "Port course scaffolding".

**WP3.4 — `internal/links` and `tutor install`** · tier S · depends: WP3.1

- Owns: `internal/links/*`, `internal/cli/install.go`.
- Port `scripts/school-links.py`: `COMMANDS = {tutor: bin/tutor}`; `SKILLS = {curriculum-author:
  curriculum-tools/skills/curriculum-author, tutor: curriculum-tools/skills/tutor}` for both
  `~/.codex/skills` and `~/.claude/skills`; `classify` outcomes `ok | create | replace identical
  copy | error` with the same inventory comparison (symlink target, dir recursion, file bytes and
  mode); preflight all destinations before mutating; `replace identical copy` renames to a temp
  sibling, links, then removes the backup. **Retired links to remove when they point into this
  checkout or the known old paths**: `/usr/local/bin/pgcoach`, `/usr/local/bin/systemscoach`,
  `/usr/local/bin/pgtutor` (old target `/root/tools/pg-systems-tutor/bin/pgtutor`), and skills
  `postgres-tutor`, `sqlite-tutor`, `linux-tutor`, `grpc-tutor`, `systemscoach`,
  `pg-systems-tutor` in both skill directories — only when they are symlinks (dangling or
  resolving into the checkout); a regular file or foreign symlink is reported and left alone.
  `--check` prints one line per target and exits 1 if anything would change.
- Tests: port the three Python tests plus "dangling retired skill link is removed" and "foreign
  file named pgcoach is preserved", all under temp directories passed through the flags.
- Commit: "Replace Python link installer with tutor install". Review focus: no path outside the
  three configured directories is touched; the removal list is exact.

**WP3.5 — Launcher** · tier S · depends: WP3.1

- Owns: `bin/tutor`; deletes `curriculum-tools/bin/tutor`, `bin/pgcoach`,
  `curriculum-tools/courses/postgres/bin/pgcoach`; `.gitignore` gains `curriculum-tools/.cache/`.
- `bin/tutor` (POSIX sh, `set -eu`): resolve `$0` through `readlink -f`; `REPO=$(dirname $(dirname $SELF))`;
  `TOOLS=$REPO/curriculum-tools`; export `TUTOR_ROOT=$TOOLS`; if `TUTOR_BIN` is set exec it;
  find `go` on PATH or `/usr/local/go/bin/go` or `/usr/local/bin/go` else print
  `tutor: Go is required (or set TUTOR_BIN to a built binary)` and exit 127; `cd $TOOLS`;
  `mkdir -p .cache`; `go build -o .cache/tutor ./cmd/tutor` (stderr passes through; on failure
  exit with go's status); `exec .cache/tutor "$@"`. Also add `tutor version` printing the git
  short hash injected via `-ldflags` in the launcher's build line.
- Acceptance: `cd /tmp && env -i PATH=/usr/bin:/bin HOME=$HOME /root/Software/skills-tools/bin/tutor courses`
  works; second invocation is under 0.5 s (`time`).
- Commit: "Replace Deno launchers with a Go build launcher".

**WP3.6 — Parity gate C and end-to-end smoke** · tier S · depends: WP3.1–WP3.5, WP2.3

- Owns: `$WORK/parity-c/`; deletes the temporary `render-check` command.
- Steps: rerun the WP2.3 comparison through `bin/tutor` from `/tmp`; add write-path smoke on a
  copy: `init`, `3 done --note x`, `route` shows `[done]`, `undone 3`, `skip 4`, `note 5 hi`,
  `5 lesson --plain` shows `## Your note`, `status --json` counts; each step's stdout matches
  §3.3. Confirm `tutor postgres-essentials 3 lesson` and `tutor postgres-essentials lesson 3`
  give identical output.
- Commit: "Remove render-check after parity". Review focus: diff empty; the three real database
  hashes unchanged.

### Phase 4 — Roadmap in the database

**WP4.1 — Author `roadmap.json` from `docs/learning_path.md`** · tier S · depends: none

- Owns: `curriculum-tools/roadmap/roadmap.json`.
- Extraction rules: `preamble` = the three paragraphs after the title up to `## Main path`,
  verbatim minus the "Updated …" sentence and the `[…](…)` link syntax (keep link text). Topics
  in document order: `### ` headings under `## Main path` → track `main`; under
  `## Supporting workshops` → `workshop`; under `## Optional branches` → `branch`. `tool` =
  text after `**Tool:**`; `goals` = text after `**Course / goals:**` with Markdown links reduced
  to their text and the linked path recorded in `plan` (only when it points into
  `future-courses/`) or `course` (only when it points to `curriculum-tools/courses/<id>/PLAN.md`,
  using that id — for PostgreSQL that is `postgres-essentials`). `diagram` = the contents of the
  ```text block if present (verbatim, no trailing newline), else `""`. `followups` = the bullets
  under `**Potential Go follow-ups — choose one:**`: `title` = bold text without the trailing
  colon, `description` = the rest, `chosen: false`. Slugs: `linux-foundations`, `postgresql`,
  `sqlite`, `docker-internals`, `networking`, `nftables`, `valkey`, `duckdb`, `object-storage`,
  `nats-jetstream`, `etcd`, `strace`, `fio`, `perf`, `bpftrace`, `firecracker`,
  `kubernetes-internals`, `kafka`, `git-internals`. Status: `postgresql` → `active`, all others
  `planned`. `notes` = the section's remaining sentences that are not tool/goals/follow-ups
  (e.g. "Requires usable KVM."), else `""`. The closing `## Planning and references` section is
  **not** imported; its guidance already lives in AUTHORING.md/future-courses, and its four
  reference links are appended to `notes` of the topic they belong to (SQLite, NATS, etcd, Git).
- Acceptance: the file validates with `jq`; 19 topics (11 main, 4 workshop, 4 branch); a
  checklist in the report maps every `###` heading and every follow-up bullet of the Markdown to
  a JSON entry (count bullets: report the number found and the number imported; they must be
  equal).
- Commit: "Add roadmap snapshot extracted from the learning path". Review focus: read three
  topics side by side with the Markdown; diagrams verbatim.

**WP4.2 — `internal/roadmap` and `tutor roadmap`** · tier O · depends: WP3.1, WP4.1

- Owns: `internal/roadmap/*`, `internal/cli/roadmap.go`.
- Fixed: §3.5 schema, JSON format, command grammar, view format, the note about a stale
  export, `import` refusing a non-empty database unless `--replace`, `export` writing via
  `fsutil.PublishOnce` to a temp file then `rename` (export replaces, so use rename, not link),
  `exported_at` updated on export, read-only view/show (open with `mode=ro`; a missing database
  → `No roadmap yet: run tutor roadmap import`). Course counts via `route.LoadRoute` on the
  linked course's default database.
- Left to the agent: table rendering helpers, argument validation messages, transaction
  helpers, how `move` renumbers positions.
- Tests: import→export round trip byte-identical to `roadmap.json`; `move`, `add --after`,
  `remove` keep positions dense; `set --status bogus` rejected; view with a linked fixture course
  and temp progress shows `k/n authored, m done`; view creates no file when the database is
  absent.
- Commit: "Add database-backed learning roadmap". Review focus: the view reads course progress
  read-only; `--json` output is the same structure as the file.

**WP4.3 — Archive the Markdown roadmap and relink** · tier S · depends: WP4.2 verified

- Owns: `archive/learning-path/{README.md,learning_path.md,learning_path-reference.md}`,
  `docs/learning_path.md` (delete), `docs/learning_path-reference.md` (delete), link edits in
  `docs/README.md`, `docs/articles/README.md`, `docs/learner-profile.md`,
  `docs/knowledge/*.md`, `future-courses/README.md`, `AGENTS.md`.
- Steps: `git mv` both files; write the archive README ("superseded on <date> by
  `tutor roadmap`; edit with the CLI, snapshot in `curriculum-tools/roadmap/roadmap.json`");
  replace every link to the two files (`grep -rn 'learning_path' --exclude-dir=archive .`) with
  a sentence pointing at `tutor roadmap` and, where research context is meant, the archive path.
- Acceptance: grep returns only `archive/` hits. Commit: "Archive the Markdown learning path".

### Phase 5 — Validation harness and course tools

**WP5.1 — `internal/harness`** · tier F · depends: WP1.1

- Port of `validator.ts`: `SplitSteps` (session headers `-- Session A`, `# Session B`,
  `// Session C`, `(blocks` detection), one persistent process per session started lazily with
  `Repl.Command`/`Env`, marker echo per step (`{marker}` substituted; shell mode appends
  `status=$?` and a non-zero status fails the step), blocking steps sent without waiting,
  per-step timeout, tool-mode courses skip `runIn: shell` lessons, labelled output lines
  `[<slug> <session>] …`, summary `N/M lessons completed without timeout`. Tests: port all seven
  `tests/validation_test.ts` cases using a Bash fixture.
- Commit: "Port the validation harness to Go".

**WP5.2 — `validate` and `progress verify` commands** · tier O · depends: WP5.1, WP3.1, WP9.2

- Owns: `internal/cli/validate.go`, `internal/cli/progress_verify.go`, tests.
- `validate`: flags `--from` (default 1), `--to` (default 999999), `--timeout` (ms, default
  30000), selectors (slug or ordinal; unknown selector → error `Unknown lesson selector: x`),
  `--isolated` (per-lesson temp lab: `SQLITE_LAB=<tmp>/sqlite-lab`,
  `TUTOR_SQLITE_DB=<lab>/lab.db` exported into the REPL env — this replaces
  `courses/sqlite/tools/validate-course.ts`, which also ran shell lessons serially: in isolated
  mode run shell lessons for every course, not only shell-mode courses); course without a `repl`
  block → error naming `course.json`; exit 1 on any failure; prints `Evidence: <dir>` in isolated
  mode and keeps the directory only when `--keep` is given.
- `progress verify`: refuse when `progress.sqlite-wal` or `-journal` exists with size > 0
  (`Close the learner's progress writer before copying`); byte-copy to a temp dir; snapshot
  `lessons(id,slug,ordinal,active)`, `progress`, `attempts` before; run `Seed` from the current
  lesson files on the copy; snapshot after; print a JSON report `{before_hash, lesson_rows,
  progress_rows, attempt_rows, progress_unchanged, attempts_unchanged, identities_preserved}`;
  never open the real file for writing.
- Tests: `validate` on a fixture Bash course with one passing and one failing lesson; `verify`
  on a copied fixture database with a reordered course. Commit: "Add validate and progress
  verify commands".

**WP5.3 — Real-tool smoke and old tool removal** · tier O · depends: WP5.2

- Owns: deletes `curriculum-tools/tools/`, `src/validator.ts`, `courses/sqlite/tools/`,
  `courses/postgres/tools/`, `courses/postgres-essentials/tools/`, `tests/validation_test.ts`;
  writes `$WORK/harness-smoke/`.
- Steps: `bin/tutor sqlite validate --isolated 1 2 3` and `bin/tutor grpc validate 1` (shell
  mode, no privileges; grpc lesson 1 only needs bash and the pinned tools — if its tools are
  absent, use `linux validate 2` instead and say so); read the output and confirm the
  `expectedResult` evidence for each lesson appears; do not run any PostgreSQL course.
- Acceptance: outputs saved with a one-paragraph reading per lesson; temp labs removed.
  Commit: "Remove TypeScript validation tools". Review focus: the reading names actual values
  from the output, not just "passed".

**WP5.4 — `VALIDATION.md` rewrite** · tier S · depends: WP5.2

- Owns: `curriculum-tools/docs/VALIDATION.md`. Keep the section structure (why, how it was
  used, conventions, adding a course); replace every `deno` command with the `tutor` form;
  add `--isolated` and `progress verify`; keep the PostgreSQL lab-building note but point at
  `tutor postgres 1 lesson --plain` instead of the Python one-liner. Commit with WP5.3.

### Phase 6 — Retire systemscoach

**WP6.1 — Scavenge Go into `internal/fsutil`** · tier S · depends: WP0.3

- Owns: `internal/fsutil/*`.
- `PublishOnce(path string, data []byte) error`: port `writeReceipt` (temp file in the same
  directory, write, fsync, close, `os.Link`, `ErrExist` tolerated, temp removed).
  `DecodeStrict(r io.Reader, v any) error`: port `decode` (DisallowUnknownFields + trailing-data
  check). `CopySQLite(src, dstDir string) (string, error)`: copies `src`, `src-wal`, `src-shm`
  when present. Tests: port `TestConcurrentCompletionsAreAtomicAndIndependent` (30 goroutines,
  one file survives with the first writer's bytes) and `TestFinishedRouteAndMalformedJSON`'s
  unknown-field/trailing-data assertions.
- Commit: "Add fsutil helpers scavenged from systemscoach".

**WP6.2 — Archive systemscoach writing** · tier S · depends: none (can run early)

- Owns: `archive/systemscoach/**`, `docs/knowledge/learner-work.md`, `docs/knowledge/README.md`
  (one row), `archive/README.md` (index entry).
- File map (`git mv`): `systems-projects/README.md` → `archive/systemscoach/README-original.md`;
  `systems-projects/AGENTS.md` → `archive/systemscoach/AGENTS-original.md`;
  `systems-projects/docs/{authoring,design-workflow,format,project-ideas,project-ranking}.md` →
  `archive/systemscoach/docs/`; `systems-projects/docs/knowledge/{README,object-store-git-labs}.md`
  → `archive/systemscoach/knowledge/`; `systems-projects/docs/knowledge/learner-work.md` →
  `docs/knowledge/learner-work.md` (active); `systems-projects/projects/cursor-git/**` →
  `archive/systemscoach/projects/cursor-git/`; `systems-projects/skills/systemscoach/SKILL.md` →
  `archive/systemscoach/SKILL.md`; `systems-projects/templates/*` →
  `archive/systemscoach/templates/`; `docs/knowledge/systemscoach.md` →
  `archive/systemscoach/knowledge/systemscoach-engine.md`.
- New `archive/systemscoach/README.md`: what the tool was, why retired (2026-09-12, Nick's
  request), the file map above, the learner's completion record (topic `cursor-git`, slug
  `objects-before-refs`, revision 1, completed `2026-09-10T01:53:22Z`, copied from the ignored
  `.state`), and that `lab/cursor/*.go` is kept as a Go lab reference for a possible future
  `tutor` course.
- Relink: run `grep -rn '\](\.\./' archive/systemscoach` and fix every relative link so it
  resolves (`find`-based check script in the report). Update `docs/knowledge/README.md`: remove
  the "Systems project track" section, add `learner-work.md` row ("Every lesson reserves
  meaningful learner work; user norm from 2026-09-09").
- Acceptance: a link checker over `archive/systemscoach/**/*.md` reports zero broken relative
  links. Commit: "Archive systemscoach documentation and cursor-git project".

**WP6.3 — Delete the tool and its links** · tier O · depends: WP6.1, WP6.2, WP3.4

- Owns: delete `systems-projects/` entirely (including `.state/`, `bin/`, `cmd/`, `go.mod`,
  `install.sh`, `.gitignore`); root `README.md` "Systems projects" section removal is done in
  WP7.4 — here only remove the directory.
- Run `bin/tutor install` and confirm `/usr/local/bin/systemscoach`,
  `~/.codex/skills/systemscoach`, `~/.claude/skills/systemscoach` are gone and
  `tutor install --check` exits 0.
- Commit: "Remove the systemscoach tool".

### Phase 7 — Skills, agent guidance, documentation

**WP7.1 — The `tutor` skill** · tier O · depends: WP3.6, WP4.2

- Owns: `curriculum-tools/skills/tutor/SKILL.md`, `curriculum-tools/skills/tutor/agents/openai.yaml`;
  deletes `courses/{postgres,sqlite,linux,grpc}/skill/`.
- Required content: front matter `name: tutor`, description naming all courses (PostgreSQL
  Essentials, PostgreSQL Systems reference, SQLite Systems, Linux Systems, gRPC reference, the
  planned SQLite Essentials and Linux v2 routes) and the roadmap; the absolute launcher path
  `/root/Software/skills-tools/bin/tutor`; the route/lesson/done contract; the progress
  invariants section copied from the current course skills (showing never completes; complete
  only on explicit request; let the CLI pick the next lesson; pass note text as one argument);
  per-course notes: Essentials is the current PostgreSQL path, `postgres` is the reference with
  separate progress, sqlite needs `TUTOR_SQLITE_DB` only for validation, grpc tools are pruned
  and must be reinstalled per its README; `tutor roadmap` for "what should I learn next"; the
  learner-work norm for any new lesson. `openai.yaml` mirrors the existing ones with
  `display_name: "Systems Tutor"`.
- Left to the agent: structure and phrasing. Commit: "Replace course skills with one tutor
  skill". Review focus: no command in the skill is one the CLI does not have (run each).

**WP7.2 — `AGENTS.md` rewrite** · tier O · depends: WP7.1

- Owns: `AGENTS.md` (keep the `CLAUDE.md` symlink).
- Must keep unchanged in substance: the VM resource/cleanup section, the learner context
  paragraph (update commands), the course editing rules, durable findings. Must remove: every
  Deno instruction, `pgcoach`, the systemscoach paragraph, "Multiple agents may own separate
  module files". Must add a **Language policy** section with these sentences (verbatim or
  tighter): "Go is the default language for CLI logic, labs, fixtures, harnesses and any other
  course tooling; Bash is acceptable for launchers, machine bootstrap, REPL guards and glue that
  would be longer or less clear in Go. Lesson experiments keep using each tool's native commands
  (psql, sqlite3, shell). Python and TypeScript are not used for new tooling." Must add: lesson
  source is `courses/<id>/lessons/NN-<slug>.md`; `tutor <course> check` before commit;
  `tutor <course> validate` for real-tool evidence; `tutor roadmap` for the learning roadmap;
  `docs/knowledge/learner-work.md` applies to new lessons. Commit: "Update agent guidance for
  the Go tutor".

**WP7.3 — Author skill and `AUTHORING.md`** · tier S · depends: WP7.2

- Owns: `curriculum-tools/skills/curriculum-author/SKILL.md`, `curriculum-tools/docs/AUTHORING.md`.
- Replacement list (each is a find→replace or a paragraph swap; nothing else changes):
  `deno task new-course …` → `tutor new-course …`; "Edit `courses/<id>/curriculum/*.ts` as typed
  Draft objects using the raw `code` tag. Register modules in `curriculum/mod.ts`" → "Add
  `courses/<id>/lessons/NN-<slug>.md` files following the grammar in AUTHORING.md; ordinals come
  from the filename"; "Build the changed course" → "Run `tutor <id> check`"; the lesson contract
  table → §3.1 field names with the same meanings; the `code` raw-template paragraph ("backslashes
  are literal… Avoid literal backticks and `${`") → "Setup and Run bodies are fenced blocks
  copied verbatim; backslashes and backticks need no escaping; a line of three or more backticks
  inside them forces a longer fence"; the "Use four-space indentation inside a TypeScript code
  template" sentence → "Diagrams are ordinary fenced ```text blocks"; `lessons.json` mentions →
  removed; add one paragraph on Go-first labs (link AGENTS language policy) and one on the
  learner-work norm. Commit: "Update authoring guidance for Markdown lessons".

**WP7.4 — Remaining documentation** · tier S · depends: WP7.2

- Owns: `README.md`, `docs/README.md`, `scripts/README.md`, `future-courses/README.md`,
  `future-courses/TEMPLATE.md`, `docs/lesson-batch-workflow.md`,
  `curriculum-tools/courses/*/README.md`, `curriculum-tools/courses/postgres-essentials/PLAN.md`
  (intro paragraph only), `curriculum-tools/courses/postgres-essentials/validation/README.md`
  (one note line).
- Rules: remove `pgcoach`, `systemscoach`, `deno`, `lessons.json`, `school-links` mentions;
  replace command examples with the §3.3 forms; root README's "Quick start" becomes
  `bin/tutor courses`, `bin/tutor roadmap`, `bin/tutor postgres-essentials route|1 lesson|1 done`,
  `bin/tutor install`; "Requirements" becomes Go 1.26+ and the course tools; "Development and
  verification" becomes `cd curriculum-tools && go test ./... && go vet ./...` and
  `tutor <course> check`; delete the "Systems projects" section; layout tree updated to the §3.2 package layout plus the top-level folders that remain
  (`bin/`, `curriculum-tools/`, `future-courses/`, `docs/`, `archive/`, `scripts/`). Historical validation
  logs keep their original commands, with a one-line note at the top of the validation README
  that they predate the Go CLI. Commit: "Update repository documentation for the Go tutor".
  Review focus: `grep -rn "pgcoach\|systemscoach\|deno \|deno task\|lessons.json\|school-links" --exclude-dir=archive --exclude-dir=.git .`
  returns only validation logs under `courses/*/validation/`.

### Phase 9 — One database for progress and roadmap (requested 2026-09-12; runs after WP3.6, before WP5.2 and Phase 7)

Goal: retire the five `courses/<id>/progress.sqlite` files. One `curriculum-tools/tutor.sqlite`
(gitignored, the file WP4.2 already uses for the roadmap) holds every course's lesson rows,
progress and attempts. Learner history is copied, never re-derived; the old files stay as
backups.

Fixed design (WP9.1 may refine wording, not semantics):

- Schema: `lessons` gains `course_id TEXT NOT NULL` as its first data column; the uniqueness
  constraints become `UNIQUE (course_id, ordinal)` and `UNIQUE (course_id, slug)`; ids stay
  global integers, so `progress`, `attempts` and `lesson_prerequisites` keep referencing
  `lessons(id)` unchanged. Indexes: `lessons_course_ordinal_idx (course_id, active, ordinal)`,
  `lessons_category_ordinal_idx (course_id, category, ordinal)`. `schema_migrations` records
  version 7 `consolidate courses`. Roadmap tables (§3.5) live in the same file unchanged.
- Every query in `internal/progress` takes the course id and adds `l.course_id=?`; `Seed`
  parks and re-parks only that course's rows (`offset` computed over the course's rows).
  `LESSON_SELECT` and all output strings are unchanged, so the golden corpus remains the oracle.
- Migration: `tutor progress consolidate [--db PATH] [--from-dir DIR]` (one-shot, safe to
  re-run: refuses when the target already has rows for that course unless `--replace`). For each
  installed course with a `courses/<id>/progress.sqlite`: refuse if `-wal`/`-journal` is
  non-empty (`Close the learner's progress writer before consolidating`); open the source
  read-only; copy `lessons` (all rows, active and retired, remapping `id` → `next free id`),
  `lesson_prerequisites`, `progress`, `attempts` with the remapped ids and original timestamps;
  verify row counts and per-slug `status/completed_revision/notes` equality between source and
  target inside the same transaction; then rename the source trio to
  `curriculum-tools/.cache/legacy-progress/<id>/progress.sqlite*` and print a per-course report
  `{course, lessons, progress, attempts, backup}`. `tutor <course> init` afterwards refreshes rows
  from the lesson files exactly as before (identity by slug within the course).
- `--db PATH` keeps its meaning (an alternate database file) and remains a persistent course
  flag; the default is `<root>/tutor.sqlite`. Read verbs still open read-only; `route` still
  reads progress only when the file exists and has a `progress` table (now filtered by course).
  Plan-only courses are unaffected. The roadmap counter reads the same file read-only.
- `progress verify` copies the one file and seeds only the named course on the copy.

**WP9.1 — Schema, queries, seed and the consolidate command** · tier F · depends: WP3.6

- Owns: `internal/progress/*`, `internal/cli/progress_consolidate.go` (+ tests), `.gitignore`
  (`curriculum-tools/tutor.sqlite*` already covered by `*.sqlite*` rules — verify).
- Tests: every WP2.1/WP2.2 test passes with a course id; two fixture courses in one database do
  not see each other's rows (`Next`, `Topics`, `Status`, `Seed` parking); consolidating copies
  of the five baseline databases into one temp file yields per-course dumps equal to the WP0.1
  `dump.json` (ids remapped, everything else identical); re-running refuses; `--replace` works;
  a non-empty `-wal` is refused. Commit: "Consolidate course progress into one database".

**WP9.2 — CLI, route, roadmap switch and parity re-run** · tier F · depends: WP9.1

- Owns: `internal/cli/*`, `internal/route/*` (progress read), `internal/roadmap/*` (counter),
  `bin/tutor` if needed, `$WORK/parity-d/`.
- Steps: default `--db` becomes `<root>/tutor.sqlite`; the read-only guarantee tests are
  re-run; parity: consolidate copies of the five baselines into `$WORK/parity-d/tutor.sqlite`,
  run the WP2.3 comparison with `--db` pointing at that file for every course (the lesson
  footer differs only by the `--db` path, compare after substituting it), expect empty diffs;
  then run the real migration on the machine: `bin/tutor progress consolidate`, confirm
  `tutor postgres-essentials route` equals golden `route.txt`, record the backup paths and
  the row counts in §A. Commit: "Serve every course from tutor.sqlite".

Documentation: no separate package. WP5.4, WP7.1–7.4 and WP8.2 describe the single
`tutor.sqlite` and the backup location from the start; `docs/knowledge/go-tutor-migration.md`
(WP8.4) gets a section "One database".

### Phase 8 — Remove the old toolchain, clean knowledge, accept

**WP8.1 — Archive-then-delete the Deno engine** · tier S · depends: all Phase 1–7 and Phase 9 packages (Phase 9 precedes Phase 5–7 in execution order)

- Commit A ("Archive the Deno engine before removal"): `git mv` `curriculum-tools/src`,
  `curriculum-tools/tests`, `curriculum-tools/deno.json`, `curriculum-tools/courses/*/curriculum`,
  `curriculum-tools/courses/*/lessons.json`, `scripts/school-links.py`,
  `scripts/school-links_test.py`, `scripts/export-legacy-reading.ts` under
  `archive/deno-engine/` mirroring their paths, plus `archive/deno-engine/README.md` explaining
  the removal date and that the converted lesson files are the source now. Delete the WP1.2
  conversion test in the same commit.
- Commit B ("Remove archived Deno engine from the working tree"): `git rm -r archive/deno-engine`
  except its README, which gains the line "The archived tree is in commit <A's hash>; check it
  out with `git show <hash>:archive/deno-engine/...`". Update `archive/README.md` index.
- Also: `.gitignore` remove nothing (the `*.sqlite` rules stay); verify `git ls-files | grep -E '\.(ts|py)$'`
  returns only `courses/*/lab/*.py` (Essentials lab helpers are lesson fixtures, not tooling —
  leave them; note them as a candidate for a later Go port in §8).
- Review focus: the working tree has no `.ts` outside `archive/` and no `deno.json`.

**WP8.2 — Knowledge cleanup** · tier S · depends: WP8.1

- Owns: the files in the §6 table and `docs/knowledge/README.md`, `archive/course-history/README`.
- Execute §6 row by row. "Rewrite" means keep the *What happened / Why it matters / How to apply*
  structure, keep every finding that is still true, replace commands with `tutor` forms, and
  add "Updated 2026-09-XX for the Go CLI" at the top. "Archive" means `git mv` to
  `archive/course-history/<course-or-topic>/knowledge/` and a row in the archive index.
- Commit: "Retire and update knowledge for the Go tutor". Review focus: every remaining
  knowledge file's commands run (`grep -o 'tutor [a-z-]* [a-z]*'` sample executed).

**WP8.3 — Machine install and reference sweep** · tier O · depends: WP8.2

- `bin/tutor install`; `bin/tutor install --check` exit 0; `ls -la /usr/local/bin | grep -E
  'tutor|coach'` shows only `tutor`; both skill directories contain only `curriculum-author`,
  `tutor`, and the unrelated `update-knowledge-store`; run the WP7.4 grep and the `.ts/.py` check.
  Report the outputs verbatim.

**WP8.4 — Final acceptance, cleanup, finding** · tier F

- Run §7 in full. Write `docs/knowledge/go-tutor-migration.md` (what changed, parity method,
  driver notes, what to do when adding a course). Remove `$WORK` after the acceptance report is
  copied into §A; leave Go caches. Mark every WP done in §A, set the status line at the top of
  this file to **complete**, and `git mv plan.md archive/plans/go-tutor-migration.md` with a
  one-line pointer from `archive/README.md`. Final commit: "Complete the Go tutor migration".

## 5. Roadmap topic list to import (WP4.1 checklist)

Main: linux-foundations, postgresql (active, course postgres-essentials), sqlite (plan
future-courses/sqlite/course.md), docker-internals, networking, nftables, valkey, duckdb,
object-storage, nats-jetstream, etcd. Workshops: strace, fio, perf, bpftrace. Branches:
firecracker, kubernetes-internals, kafka, git-internals. Follow-up bullet counts to verify
against the Markdown: linux 3, postgresql 3, sqlite 3, docker 2, networking 3, nftables 2,
valkey 3, duckdb 3, object-storage 3, nats 3, etcd 3, strace 2, fio 2, perf 2, bpftrace 2,
firecracker 2, kubernetes 3, kafka 3, git 2 (total 49).

## 6. Documentation and knowledge cleanup checklist (executed in WP8.2 unless noted)

| File | Action | Reason |
| --- | --- | --- |
| `docs/knowledge/repo-tooling.md` | Rewrite | Deno paths and `deno task` checks are gone; document `go test/vet`, `gofmt`, the launcher cache, the Docker rig. |
| `docs/knowledge/validation-harness.md` | Rewrite | Describes `tools/validate.ts`; keep the evidence-reading lessons, point at `tutor <course> validate`. |
| `docs/knowledge/concise-course-cli.md` | Rewrite | References pgcoach, systemscoach, `deno task build`, wrappers, the reading migration. |
| `docs/knowledge/systemscoach.md` | Archive (WP6.2) | Tool retired. |
| `docs/knowledge/course-workflow-cleanup.md`, `school-final-refactor.md`, `school-final-refactor-migration.json` | Archive to `archive/course-history/school/knowledge/` | Historical acceptance records. |
| `docs/knowledge/command-inventory-extraction.md` | Update | Derive from `lessons/*.md` or `tutor <course> list --json`. |
| `docs/knowledge/lesson-identity-refresh.md` | Update | Same rules; refer to `internal/progress` and `tutor <course> progress verify`. |
| `docs/knowledge/postgres-essentials.md`, `grpc-course.md`, `progressive-course-design.md`, `postgres-lab.md`, `postgres-refactor-integration.md` | Update | Replace pgcoach/Deno references. |
| `docs/knowledge/subagent-workflow.md` | Keep, trim | Remove Deno verification commands. |
| `docs/knowledge/learner-work.md` | Added (WP6.2) | Moved from systemscoach. |
| `docs/knowledge/README.md` | Rewrite table | Reflect all of the above. |
| `docs/learning_path.md`, `docs/learning_path-reference.md` | Archive (WP4.3) | Roadmap is in the database and `roadmap.json`. |
| `docs/README.md` | Rewrite (WP7.4) | New CLI, roadmap command, no systemscoach section, archive pointers. |
| `handoff.md` (root, 2026-09-06) | Delete (WP0.3) | Completed batch handoff never removed. |
| `future-courses/README.md`, `TEMPLATE.md`, `docs/lesson-batch-workflow.md` | Update (WP7.4) | Command spellings only. |
| `curriculum-tools/docs/AUTHORING.md`, `VALIDATION.md` | Rewrite (WP7.3, WP5.4) | Markdown lesson contract, Go commands. |
| `curriculum-tools/courses/*/README.md`, Essentials `PLAN.md` intro, validation READMEs | Update (WP7.4) | Remove pgcoach/deno spellings; historical logs keep theirs with a note. |
| `docs/articles/README.md`, `docs/learner-profile.md` | Update links (WP4.3) | Roadmap references. |
| `scripts/README.md` | Rewrite (WP7.4) | No Python installer; `tutor install`. |

## 7. Acceptance criteria (WP8.4)

1. `go build ./...`, `go vet ./...`, `gofmt -l` empty, `go test -race ./...` green in
   `curriculum-tools/`. No `.ts`, `deno.json`, or tooling `.py` outside `archive/` and history.
2. Golden parity: all 250 `lesson --plain` outputs, `route`, `status --json`, `topics --json`,
   `modules`, `search vacuum`, `courses` byte-identical to the Deno corpus (after `jq -S`).
3. Learner progress: after Phase 9, `tutor.sqlite` contains, per course, exactly the lesson
   identities, `progress` rows and `attempts` rows of the WP0.1 dumps (or differs only by rows
   the learner completed meanwhile, each listed); the per-course backups' SHA256 match WP0.1.
   `tutor postgres-essentials route` shows the same done/revisit rows as the golden `route.txt`.
4. `/labs/pglab` answers on port 5440 with its original data directory; no validation ran
   against it.
5. From `/tmp` with a minimal PATH: `tutor`, `tutor courses`, `tutor roadmap`,
   `tutor postgres-essentials route`, `tutor sqlite-essentials route` work and create no files.
   `tutor install --check` exits 0; `pgcoach`, `systemscoach`, `pgtutor`, `pg-systems-tutor` are
   gone.
6. `tutor roadmap` shows 19 topics and 49 follow-ups; `export` after `import` reproduces
   `roadmap.json` byte-for-byte.
7. Harness smoke outputs from WP5.3 exist with inspected evidence.
8. §6 done; knowledge index consistent; this plan archived; free disk ≥ WP0.1 baseline minus
   Go caches; `$WORK` and any owned temp directories removed (`ls /tmp | grep -i tutor` empty).

## 8. Risks, deferred work

- **Renderer or SQL drift** → the three parity gates run before any Deno file is deleted.
- **`modernc.org/sqlite` behavior** → verified by seeding copies of the real databases (WP2.1);
  fallback `mattn/go-sqlite3` (cgo; gcc present) if a STRICT/WAL/`FILTER` difference appears.
- **Learner activity during the work** → all comparisons on copies; acceptance reports the diff.
- **Offline module proxy** → vendor in WP0.3.
- **Cobra and `3 lesson`** → `NormalizeArgs` runs before Cobra; tested in WP3.1.
- Deferred: renaming `curriculum-tools/`; porting the four
  Essentials `lab/*.py` fixtures and `courses/grpc/lab` to Go; turning the archived `cursor-git`
  project into a `tutor` course; removing Deno from `lab-setup.sh` and the VM.
