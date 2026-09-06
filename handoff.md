# PostgreSQL Essentials lessons 4–6

Updated 2026-09-06. User enjoyed the lesson/review flow in 1–3 and authorized the next three
lessons, Sol subagents where useful, parent validation/refactoring, and commits per reviewed chunk.

## Scope and ownership

- Follow `curriculum-tools/courses/postgres-essentials/PLAN.md`, rows 4–6 exactly.
- Preserve the two substantial views, concepts and diagram before commands, supplied syntax,
  mental reflection, optional references, and 20–30 minute total budgets.
- Parent owns integration, renderer, tests, validation controller, documentation, this handoff,
  final editorial/SQL review, and all commits.
- Sol authors owned one new curriculum file and one matching diagram export each. They did
  not edit shared files, generated catalogs, or learner progress. All have finished and relinquished ownership.
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
2. All three Sol/high authors finished. Parent independently reviewed and validated every final
   lesson. Authors 4/5 abandoned blocked ownership/setup requests before initdb; no author server
   was started. Their scratch is removed. Lesson 6 used static author checks only.
3. Reviewed lesson commits:
   - `4c9c427`: lesson 4; heap 1,826,816 bytes throughout, free bytes 76,572 → 1,819,680 → 76,572.
   - `693e2da`: lesson 5; stale result 120 versus atomic result 130, B observed waiting on A.
   - `bf19335`: lesson 6; stale stock -1/two accepts versus protected stock 0/one accept, B waited
     before receiving 0/decline.
4. Exact original lessons 1–3 are unchanged. All six final built lessons passed together;
   source hashes, outcomes and the combined log are under `validation/lessons-1-2-3-4-5-6-*`.
   Full repository format/lint/type checks and all 37 tests passed. The extra logical-history
   assertion for WAL-mode SQLite passed the affected coaching tests afterward.
5. Copied-catalog refresh and all 18 views passed. Live supported-CLI catalog refresh then preserved
   all three progress rows and three attempts. Default `pgcoach` opens lesson 4; lesson 7 remains
   planned. Main file hashes stayed unchanged, but Essentials has a WAL: logical row comparison
   is the evidence for history preservation. See `validation/batch-two-progress.json`.
6. All owned PostgreSQL roots stopped/removed. Parent also removed the confirmed 372 KB author-4
   source copy. Original learner PID 348739 remains ready; other course progress hashes are
   unchanged. Disk ~16 GB free, memory ~6.8 GiB available. Only ~160 KB small course evidence is
   retained; there are no retained database/backup images or outstanding evidence obligations.
7. Complete. Integration/documentation committed as `9251b1a`. A fresh archive of that commit
   rebuilt the identical six-lesson catalog, passed the full format/lint/type check, and passed
   all 37 tests. Its source snapshot/test progress were removed. Final cleanup is recorded in
   `validation/batch-two-cleanup.json`; no outstanding acceptance or resource work remains.
   Root/docs index changes excluded prior gRPC additions. Only the required --reference output
   routing was committed from the old renderer; unrelated pilot edits and gRPC work remain intact
   and unstaged. Start with `pgcoach 4 lesson` (or just `pgcoach`).

Next session: do not rerun this completed acceptance. Learner can take lessons 4–6 and discuss
clarity/time after 6 before authoring 7–9. No completion of the new lessons was recorded.

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
