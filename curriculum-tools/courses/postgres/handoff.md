# PostgreSQL pivot handoff

Updated 2026-09-04. **Chunk 1 committed/pushed; chunk 2 awaits primary integration review.**

## User authorization and intended result

The learner completed original lessons 1–7. They approved the systems-engineering review and the
guided read/predict/run/inspect/explain/vary/apply loop, with supplied commands and gradually
reduced scaffolding. They explicitly requested a plan, bounded designs, Terra subagents on high,
primary ownership of hard changes and final code/wording review, and commit/push for each chunk.

Read `REWORK-PLAN.md`, then the active contracts in `designs/`, and the prior review at
`../../../docs/knowledge/postgres-project1-review.md` (repository `docs/knowledge/`). Read repo
AGENTS, docs/README, AUTHORING and curriculum-author skill. Do not reinterpret this as a request for
another review or stop after planning: implementation and validation are authorized.

## Current state

- Branch main, remote origin `git@github.com:nickstrad/skills-tools.git`; fetched successfully.
- Chunk1 builds93 lessons. Primary final sequence8–20 completed13/13 without SQL errors or timeouts
  using --timeout90000. See validation/01-integration.md for corrections, real output evidence,
  copied progress migration and30 passing tests. First7 built objects and learner progress hash
  remain identical. lesson-map.md records retirements/current reading stops.
- Active unrelated SQLite changes include its course, generated lessons, shared `src/main.ts`,
  `tests/main_test.ts`, bootstrap and Docker scripts. Never stage these with PostgreSQL changes.
- Shared-engine work includes slug-preserving progress reseeding. Do not edit those files; verify
  integration on a copied progress database when that work lands.
- Plan has chunks 0–7. Exact designs are authored by the primary before delegation, not left to
  agents.
- Terra/high agents completed designs/02-concurrent-clients.md subsets and transferred ONLY
  curriculum/05-isolation.ts, curriculum/06-locking.ts, guides/05-isolation.ts,
  guides/06-locking.ts, validation/02-isolation.md and validation/02-locking.md into root. Those six
  files await primary review and commit. Their private copies remain /tmp/pg-pivot-isolation-work
  and /tmp/pg-pivot-visibility-work. All three agents are finished/idle, not implementing new work.
- Primary owns client-protocol.ts, worker-protocol.ts, the guide registry and unknown-outcome
  protocol. The two helper drafts have primary runtime evidence in
  validation/02-primary-protocols.md. Root generated lessons.json is still the committed chunk1
  snapshot; rebuild only after reviewing the transferred module changes and updating guides/mod.ts.
- Private PostgreSQL16.15 cluster: `/tmp/postgres-pivot-20260904/primary`, socket
  `/tmp/postgres-pivot-20260904/socket`, port5540, role postgres. DBs: pivot_storage,
  pivot_visibility, pivot_primary. Extensions installed. Setup script `/tmp/pg-pivot-lab.sh`.
  Switching OS users required escalation; approved prefix `bash /tmp/pg-pivot-lab.sh`.
- Local socket access requires escalation too; `psql` prefix approved after sandbox denial. Primary
  SELECT1 connection check passed.
- Original learner progress SHA256:
  c7866ba1b78cb7b2aa6c1a2951149cd14c278130f92333c1e5b8dffd063f128f.
- Storage core and variation evidence is in validation/01-storage.md; visibility/reclamation
  evidence is in validation/01-visibility.md. Each agent built its own copy; neither private lesson
  count is the final combined count. Core SQL ran on PostgreSQL16.15, not the learner cluster.
- Guided CLI review corrections are implemented: full caution/version/run environment at run,
  correct shell quoting, dynamic fixture completion count, explicit-help routing and no stale
  prerequisite ordinal lookup. Agent reports four passing tests and a launcher smoke with spaces and
  an apostrophe in the temporary progress path. Primary added shell/mixed rendering checks; all five
  coaching tests and25 engine/validation tests pass.
- Primary retry protocol prototype passed a controlled SQLSTATE40001 followed by a fresh successful
  transaction and exactly one effect. Base result95|1; competitor+20 variation110|1. Scripts:
  /tmp/pg-pivot-retry.sh and /tmp/pg-pivot-retry-variation.sh; evidence directories
  /tmp/pg-retry-Potk2s and /tmp/pg-retry-yCqb11. Source client-protocol.ts is not yet integrated.
- Primary worker-protocol.ts now exercises competing takeover and unavailable-claim retry after
  rollback. Runtime passed with both rivals UPDATE0, stale/duplicate INSERT0, all three final
  invariants true. Driver /tmp/validate-pg-worker.ts; raw /tmp/pg-pivot-worker.log. This is an
  unintegrated chunk2 helper, not yet committed with lesson06.
- Completed-seven hashes: `validation/completed-baseline.json`; original 96 lesson artifact
  snapshot: `/tmp/postgres-pivot-original-lessons.json`.

## Next actions

1. Review transferred05/06 wording/code and validations. Integrate guides05/06 into guides/mod.ts.
   Implement the new unknown-commit-outcome lesson per designs/02-concurrent-clients.md; primary
   owns the receipt/payload/business-effect protocol and the lost-response experiment.
2. Rebuild PostgreSQL, independently validate concurrent cores/variations, refresh map and copied
   progress checks, then commit/push the accepted chunk2. Source modules are transferred but not yet
   accepted merely because agents reported passing runs.
3. Design and deliver chunks3–7 from REWORK-PLAN. No later performance, recovery, replication,
   outbox/fencing or capstone chunk is complete. Continue bounded Terra/high delegation and primary
   ownership of hard protocol/failure semantics and final review.
4. Record durable findings in docs/knowledge, keep this handoff committed/pushed at checkpoints, and
   remove it only after every approved chunk is complete. The overall refactor is not done.

## Durable constraints

Preserve original lessons 1–7 exactly. Keep course revision 2, explicit revision 4 for material
edits (some existing checkpoint lessons already use3). Keep surviving slugs, map retirements and
ordinals. Do not edit learner progress. No blanket git add, reset, stash, force-push, or changes to
other agents' files. Do not crash the learner's port-5440 lab. Use an owned private cluster and
separate databases; coordinate global operations serially.

## Commits and evidence

- `4406657` pushed: initial plan, review, handoff and completed-seven baseline.
- `6d2fe8a` pushed: exact chunk1 contracts, guide interfaces and lab/agent ownership.
- `90e82d4` pushed: user-requested repo-wide project scale and progressive ownership alignment.
  Updated learning_path, AUTHORING, curriculum-author skill and wrapper template; recorded reusable
  findings in docs/knowledge/progressive-course-design.md and index. Skill validator and scoped
  format/diff checks passed. Installed author skill is a symlink to the edited repository source.
- `17df58c` pushed: previous handoff checkpoint. No learner progress mutation.
- `d4dfd08` pushed: concurrent-client design and implementation checkpoint.
- Foundation acceptance is in validation/01-integration.md; later protocol prototypes are not final
  course acceptance. Overall refactor remains incomplete: chunks2–7 require implementation,
  integration and validation. Repo-wide learning guidance is already pushed.

- `948f2d1` pushed: accepted guided foundation,93-lesson build, stable identity map, final runtime
  evidence, copied-progress preservation and durable experiment findings.
