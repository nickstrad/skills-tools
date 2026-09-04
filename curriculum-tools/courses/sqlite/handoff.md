# SQLite course rework handoff

Updated: 2026-09-04. Implementation and final primary writing are complete; final reporting and
scoped commits/push remain. Delete this file only in the completion commit.

## User contract

SQLite is the second deep transactional-storage course after PostgreSQL: preserve useful internals,
contrast different mechanisms, and develop practical systems/distributed-systems judgement. User
requested Luna/high agents with primary-designed tasks, primary-owned writing, independent
verification, incremental commits/push, this temporary handoff, and durable knowledge-bank findings.

## Completed

- Pushed `67aa492`: accepted rework plan, stable lesson identity by slug with retirement/reorder
  regression tests, explicit FTS5 bootstrap/probe and initial handoff.
- Pushed `9d36267`: indexed knowledge on SQLite curriculum design and progress-identity refresh.
- Final course is 54 lessons/10 modules (48 previously, 10 new, 4 consolidated retirements).
  `PLAN.md` is authoritative now; `REWORK-PLAN.md` records the initial analysis. `LESSON-MAP.md`
  records every old/new ordinal, slug and explicit revision.
- All agent source ownership transferred to PRIMARY. Luna/high agents implemented bounded drafts and
  audited evidence. Primary authored modules08/09, extensively revised all final explanations, and
  corrected/replaced weak concurrency, checkpoint, benchmark and toolkit implementations. All three
  agents have finished final bounded audits; no outstanding delegated work.
- Built final `lessons.json`; toolkit module10 precedes capstone09. Reading checkpoints now
  13/19/25/31/37/41. Wrapper skill remains installed via symlink and has updated refresh guidance.
- Final isolated run: `/tmp/sqlite-course-evidence-b28de6a306ae3774`, all54 completed, semantic
  review passed (primary and bounded agent audits).
- Final sequential run: `/tmp/sqlite-course-evidence-bc8e863e6d868e90`, all54 completed and primary
  semantic/error review passed. Earlier reviewed full sequential run:
  `/tmp/sqlite-course-evidence-7c0602f97be65576`.
- Native A/B lessons used distinct persistent REPLs; shell lessons ran serially with private scratch
  paths and actual owned-process kills. Sync traces actually ran with ptrace permission. An earlier
  isolated run failed only because prerequisite shell variables leaked; fixed with subshell
  isolation and reran the complete course.
- Course-local `tools/validate-course.ts` preserves output/expected results and does NOT claim
  semantic PASS merely from exit0. `tools/verify-progress.ts` copies progress without opening the
  real DB and checks two refreshes, preserved identities/history and all54 rendered lessons.
- Copied-progress report: `/tmp/sqlite-progress-verification-8a4851d1cb0bc34d`; preserved48 old slug
  IDs,54active/4retired,54 renders and six checkpoint positions. Actual learner history was empty;
  populated notes/attempts/status are covered by synthetic tests.
- Latest full tests:30 passed,0 failed. Scoped SQLite/src/tests formatting, lint and typechecks
  passed. Full repository check was blocked by concurrent unrelated PostgreSQL formatting; retry at
  completion, never format another author's files to make it green.
- Real progress unchanged; original SHA256 SQLite:
  `c714b24935a8f888c991474fdc11f536c6470d1703c290b31b428206a4e86ffc`; PostgreSQL:
  `c7866ba1b78cb7b2aa6c1a2951149cd14c278130f92333c1e5b8dffd063f128f`.
- Runtime: same SQLite3.53.4 official archive, verified SHA3, rebuilt with FTS5 while retaining
  dbstat/dbpage/bytecode. Actual capabilities tested. Whole Docker bootstrap was NOT rerun.
- Durable knowledge additions/updates are implemented, some still uncommitted:
  sqlite-curriculum-design, lesson-identity-refresh, sqlite-lesson-gotchas, validation-harness,
  subagent-workflow. Reading/checkpoint docs and wrapper are updated.

## Remaining finite tasks

1. `VALIDATION.md` now records all54 semantic verdicts, measurements, limits and commands.
   Standalone writer benchmark also passed at `/tmp/sqlite-course-evidence-b2b6f9e879963710`. Latest
   copied-progress/render run passed at `/tmp/sqlite-progress-verification-4825114195e76f7c`.
2. Final tests30/0, build, hashes and all scoped typechecks passed, including the new tools after
   correcting Uint8Array/BufferSource typing. Copied refresh passed again at
   `/tmp/sqlite-progress-verification-47cb953027de2311`. Retry global check if other authors have
   finished formatting. Do not imply a global pass when only scoped checks pass.
3. Commit/push completed SQLite course chunk including updated handoff, tools, generated artifact,
   plan/map/report, wrapper and the small metadata-based checkpoint regression-test correction.
4. Commit/push owned reading/knowledge updates, final report adjustments and handoff deletion. Final
   answer links plan/report, confirms knowledge updates and no progress mutation.

## Shared worktree cautions

Repo `/root/Software/skills-tools`, Deno workdir `curriculum-tools`, executable
`/root/.deno/bin/deno`. Branch main; origin git@github.com:nickstrad/skills-tools.git. Concurrent
PostgreSQL/Linux/article/roadmap work is unrelated. Stage explicit owned paths only.
`docs/README.md` has our SQLite checkpoint-number hunk AND unrelated new sections: stage only our
hunk. `docs/knowledge/README.md` has other authors' rows; our two new rows already committed.
Initial untracked `bin/` is unrelated. Do not change real progress or mark lessons done.
