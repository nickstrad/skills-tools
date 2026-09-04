# SQLite course rework handoff

Updated: 2026-09-04. Work is active. Delete this file in the final completion commit only after all
implementation, primary writing/review, integration and validation have finished.

## User intent and accepted direction

- Improve SQLite for systems/distributed-systems engineering after the PostgreSQL course; retain
  proven internals experiments and emphasize distinct mechanisms and application responsibilities.
- User explicitly requested gpt-5.6-luna subagents at high effort, with primary actively directing
  approaches, correcting/replacing weak code, and owning final writeups or substantial draft edits.
- User clarified this is not a rewrite of every working experiment. Preserve mechanics when no
  identified gap requires a change; explanatory expansion is separate from semantic changes.
- User requests this handoff stay current, completed chunks be committed/pushed, and this file be
  deleted when all work is done. Commit only owned/completed work; unrelated concurrent edits exist.

## Plan and files

- Authoritative lesson specification: `REWORK-PLAN.md` in this directory. Target 54 lessons/10
  modules.
- Retire four redundant slugs: compare-and-swap-update, snapshot-reader, transactional-outbox,
  lease-expiry-and-fencing. Their coverage is consolidated, not silently reassigned.
- New `curriculum/10-toolkit.ts` must be registered BEFORE `09-capstone.ts` in mod.ts.
- Existing PLAN.md still describes previous course; update to final state before completion.
- Real progress MUST remain unchanged; original SHA256 sqlite:
  `c714b24935a8f888c991474fdc11f536c6470d1703c290b31b428206a4e86ffc`; postgres:
  `c7866ba1b78cb7b2aa6c1a2951149cd14c278130f92333c1e5b8dffd063f128f`.

## Agent ownership and active review

- `/root/foundations`: 01-lab-file.ts, 02-pages.ts, 04-concurrency.ts (19 lessons). Primary
  requested explicit approach checkpoint; interrupted/followed up to force it. Needs final
  evidence/ownership handoff. Draft retry prose incorrectly says B rolls back where actual A rolls
  back; primary must fix.
- `/root/mechanisms`: 03-journals.ts, 05-wal.ts, 07-performance.ts (16 lessons).
  Interrupted/followed up for design checkpoint. Draft benchmark had errors: worker settings reset
  on reopen, unequal total rows, rows confused with transaction successes, failed BEGIN falls
  through into INSERT/COMMIT, marker prefix collisions, incomplete error classification, no
  throughput/assertions, erased logs. Primary sent exact corrections. Generic repeated syntax
  constants must be replaced by primary's per-lesson prose. Needs actual evidence and ownership
  handoff.
- `/root/recovery_toolkit`: now ONLY 06-recovery.ts and 10-toolkit.ts (10 lessons). Primary took
  09-capstone.ts ownership back and rewrote it. Agent interrupted/followed up with exact fixes:
  data_version must be compared on SAME connection; dot commands need standalone lines; observe live
  WAL while connections open; unique scratch dirs/evidence; missing FTS5 is nonzero prerequisite;
  ATTACH rollback-mode atomicity claims must be precise. Needs final evidence/handoff.
- Primary owns 08-local-systems.ts, offline-protocol.ts, 09-capstone.ts, plan, runtime, integration,
  progress correctness, final teaching prose and independent final validation.
- Do not race agents editing assigned files. Coordinate crash/corruption validation serially.

## Primary completed implementation and evidence

- Wrote lesson-level REWORK-PLAN.md, including acceptance/retirement/progress/delegation details.
- Enabled FTS5 in bootstrap `scripts/lab-setup.sh` using --enable-fts5 and added real CREATE/MATCH
  verification to `scripts/docker/verify.sh`.
- Rebuilt SAME SQLite 3.53.4 from existing official archive `/tmp/sqlite-autoconf-3530400.tar.gz`,
  SHA3-256 verified against bootstrap. Build directory `/tmp/sqlite-fts5-build.X7KuFy`. Installed
  with approved `make install`; /usr/local/bin/sqlite3 now supports fts5 plus retained
  dbstat/sqlite_dbpage/bytecode. Actual FTS5 probe returned 1.
- Found existing engine seed maps identity by ordinal, which misattributes notes/completion during
  reorder. Fixed src/main.ts to retain stable IDs by slug and map prerequisites to IDs, keep retired
  history. Added meaningful reorder/removal/reintroduction/notes/attempt/skip regression test. All
  18 main_test.ts tests passed. No real progress writes. Needs full final tests and copied-progress
  migration verification; exception to avoiding generic engine changes is documented in rework plan.
- Primary wrote six module08 lessons and shared authoring-only offline-protocol.ts strings. Rendered
  lessons include SQL/shell functions IN FULL, no hidden app dependency. Separate database/process
  commits, atomic receiver effect+receipt, identity payload guard, per-origin contiguous merge,
  logical tie-break, premature tombstone-GC counterexample, old restore/new-generation rejoin.
- All six module08 initial real-tool tests passed. Logs: `/tmp/sqlite-local-review-4ea56b61aece646c`
  (5 noncrash lessons), `/tmp/sqlite-local-review-c6595a1f47c4b65f` (actual sender SIGKILL137,
  replay balance90/receipt1), `/tmp/sqlite-local-review-9241d8b3a63a9a86` (restore after atomic
  counter-trigger improvement). Test driver `/tmp/sqlite-rework-local-validation.ts`. Root08 still
  needs final prose/robustness review.
- Primary just rewrote 09-capstone.ts completely; NOT YET validated. It uses diagnostic pause,
  actual owned-process death and asserted recovery invariants, and an honest incomplete ADR with
  controlled contention + restore evidence and explicitly unmeasured production requirements.
- Added course-local `tools/validate-course.ts`: serial shell+native-REPL execution, saved logs with
  expected results, optional --isolated (hot recovery automatically runs crash prerequisite). NOT
  YET run against integrated final course. Generic REPL counts timeouts, so manual evidence review
  remains mandatory. Shell commands use timeout120s and unique lab dirs.

## Required next work

1. Commit/push completed foundation chunk (plan/handoff, progress-ID fix/tests, FTS bootstrap/probe)
   after formatting/testing. Avoid staging partial agent sources/generated lessons.
2. Get agent approach/evidence/handoffs; inspect every implementation. Primary owns final prose,
   especially module-specific explanations and PostgreSQL contrasts, not generic boilerplate.
3. Validate primary09 and any corrected08. Review pipe/error/scratch/identity guarantees carefully.
4. Register toolkit; normalize order to REWORK-PLAN, remove stale prerequisites; build54.
5. Independently validate changed concurrency/failure cases, every lesson isolated and sequential
   full course; run quiet benchmark measurements. Read EVERY log vs expected including SQL errors.
6. Final explanation review and edits, revision policy (editorial-only preserves old revision;
   material changes revision3, new1), six study checkpoints and all old ordinal references.
7. Update final PLAN.md, docs/readings/sqlite files, wrapper refresh guidance, capability docs,
   durable knowledge and old/new lesson map. Preserve unrelated docs edits.
8. Full deno task check/test, shell syntax, rendered checkpoint/representative lessons, migration on
   COPY of progress and real-progress SHA256 equality. Commit/push coherent milestones throughout.
9. Final clean owned diff/report; delete handoff.md in final completion commit, push and summarize.

## Workspace cautions

Initial git status had unrelated untracked `bin/`. Concurrent unrelated work has since added
`docs/knowledge/postgres-project1-review.md` and a README index row; preserve both. Agents have
edited shared owned sources despite private-copy request; some shared lessons.json builds happened
during drafts. Primary must regenerate only after integration, not trust that interim generated
artifact. Use /root/.deno/bin/deno from curriculum-tools. User authorized git commits/pushes in
latest request.
