# PostgreSQL Essentials lessons 4–6

Updated 2026-09-06. User enjoyed the lesson/review flow in 1–3 and authorized the next three
lessons, Sol subagents where useful, parent validation/refactoring, and commits per reviewed chunk.

## Scope and ownership

- Follow `curriculum-tools/courses/postgres-essentials/PLAN.md`, rows 4–6 exactly.
- Preserve the two substantial views, concepts and diagram before commands, supplied syntax,
  mental reflection, optional references, and 20–30 minute total budgets.
- Parent owns integration, renderer, tests, validation controller, documentation, this handoff,
  final editorial/SQL review, and all commits.
- Sol authors will own one new curriculum file and one matching diagram export each. They must
  not edit shared files, generated catalogs, or learner progress. Parent registers/builds them.
- Design and acceptance contract: `curriculum-tools/courses/postgres-essentials/designs/04-06.md`.

## Initial state and preservation

The entire Essentials directory was untracked at turn start. Numerous prior changes already exist
in the original PostgreSQL renderer, launcher, skill, root/docs indexes and learner profile;
the gRPC course is also untracked. Preserve this work. Commit the existing Essentials baseline
separately so new lesson commits have readable diffs; do not sweep unrelated work into commits.
Initial HEAD: `f6e52c8`. No existing root handoff was present.

Verified outside the sandbox process namespace: learner PostgreSQL 16.15, original PID 348739,
`/labs/pglab/primary`, socket `/tmp`, port 5440, database `lab`. About 16 GB disk and 6.9 GiB memory
available. Private labs budget <200 MB each, <600 MB peak with three authors; no replicas/backups.
Do not interpret sandbox `pgrep` returning nothing as a stopped cluster.

Protected progress SHA256 before work:

- Essentials: `532af6e82f94ee7dbc05ad05050234c6d14d0f1b3eb0faa3a83ef6865309c87c`
- Reference: `395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6`

## Checkpoints

1. Preflight and existing course review completed. Baseline/design committed as `b8035f1`.
2. Sol/high authors `/root/lesson4`, `/root/lesson5`, `/root/lesson6` are active in their assigned
   files. Parent is implementing shared rendering and a course-local observed-wait validator.
3. Parent shared renderer now supports one/two terminals and current batch feedback. Three coaching
   tests pass. New course-local driver uses the shared REPL/splitter and proves each deliberate B
   lock wait on A before continuing. Exact original lessons 1–3 reran successfully; private root
   `/tmp/pg-essentials-validation-ol6ss0lw` removed and both learner progress hashes unchanged.
   New lesson drafts exist; authors retain ownership until their validation reports are complete.
   Lesson 4 parent final pass is complete and its final prose/build rerun passed: heap 1,826,816
   bytes throughout; free bytes 76,572 → 1,819,680 → 76,572; visible rows 4,000 → 0 → 4,000.
   Final run root `/tmp/pg-essentials-validation-_lo5k8ev` removed; progress unchanged.
   Parent owns all curriculum files now. Authors 4/5 hit pending runtime setup approvals, so
   parent stopped duplicate setup efforts; they are finishing honest reports and scratch cleanup.
   Lesson 6 author used static checks only. Parent independently validates every final lesson.
   Lesson 4 committed as `4c9c427`. Lesson 5 final syntax/cleanup review and exact standalone run
   passed: stale replacement 120 versus atomic result 130, with B observed on A's transactionid
   lock. Its private root `/tmp/pg-essentials-validation-d2vhn5tk` is removed; progress unchanged.
4. Six-lesson navigation/progress checks, durable findings, cleanup and learner readiness; pending.

## Resume and completion rules

Read repository AGENTS.md, docs/README.md, the curriculum-author skill and the design contract.
Inspect git status and agent messages before editing owned files. Use `/root/.deno/bin/deno` from
`curriculum-tools/`. Rebuild lessons.json; never hand-edit it. Validation must assert observed
outcomes and expected waiting, not just trust harness PASS. Use only uniquely owned private labs,
stop/remove them in finally, and preserve both progress databases. Before final completion,
recheck learner identity, progress hashes, disk headroom and absence of owned processes.

Catalog delivery: test `tutor postgres-essentials init` on a copy of the learner database first.
Then refresh the live lesson catalog through that supported CLI so lessons 4–6 can be opened;
compare progress/attempt rows before and after (catalog refresh changes file bytes legitimately).
Never record completion for the user. Reference database must remain byte-identical.
