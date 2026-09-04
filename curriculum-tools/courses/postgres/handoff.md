# PostgreSQL pivot handoff

Updated 2026-09-04. **Active: chunk 0, plan and contracts.**

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
- No PostgreSQL source edits yet. Prior review and its knowledge-index row were uncommitted at
  start.
- Active unrelated SQLite changes include its course, generated lessons, shared `src/main.ts`,
  `tests/main_test.ts`, bootstrap and Docker scripts. Never stage these with PostgreSQL changes.
- Shared-engine work includes slug-preserving progress reseeding. Do not edit those files; verify
  integration on a copied progress database when that work lands.
- Plan has chunks 0–7. Exact designs are authored by the primary before delegation, not left to
  agents.
- No agents assigned yet; no validation cluster created yet; no lesson runtime validation yet.
- Completed-seven hashes: `validation/completed-baseline.json`; original 96 lesson artifact
  snapshot: `/tmp/postgres-pivot-original-lessons.json`.

## Next actions

1. Record completed-seven built baseline and progress hashes without initializing learner progress.
2. Write chunk-1 contracts: staged CLI; HOT/TOAST/cache; MVCC/reclamation consolidation.
3. Commit/push chunk 0 scoped docs.
4. Start Terra/high agents for the three bounded contracts; primary provisions isolated validation
   and designs the next concurrency/protocol chunk while they implement.
5. Review every returned diff, independently validate, update this file and evidence, then
   commit/push.

## Durable constraints

Preserve original lessons 1–7 exactly. Keep course revision 2, explicit revision 3 for material
edits. Keep surviving slugs, map retirements and ordinals. Do not edit learner progress. No blanket
git add, reset, stash, force-push, or changes to other agents' files. Do not crash the learner's
port-5440 lab. Use an owned private cluster and separate databases; coordinate global operations
serially.

## Commits and evidence

Chunk 0 is being committed with this handoff, plan, prior review, and completed-seven baseline. Use
`git log --oneline -- courses/postgres/handoff.md` from curriculum-tools to find the current
checkpoint commit; subsequent updates record preceding committed checkpoints. No runtime evidence
yet.
