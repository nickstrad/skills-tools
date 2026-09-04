# PostgreSQL pivot handoff

Updated 2026-09-04. **Active: chunk 1, three bounded implementations and private validation.**

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
- Active Terra/high agents: `guided_cli` owns designs/01-guided-cli.md files; `storage` owns
  designs/01-storage.md files; `visibility` owns designs/01-visibility-reclamation.md files.
- Private PostgreSQL16.15 cluster: `/tmp/postgres-pivot-20260904/primary`, socket
  `/tmp/postgres-pivot-20260904/socket`, port5540, role postgres. DBs: pivot_storage,
  pivot_visibility, pivot_primary. Extensions installed. Setup script `/tmp/pg-pivot-lab.sh`.
  Switching OS users required escalation; approved prefix `bash /tmp/pg-pivot-lab.sh`.
- Original learner progress SHA256:
  c7866ba1b78cb7b2aa6c1a2951149cd14c278130f92333c1e5b8dffd063f128f.
- No changed-lesson runtime validation yet; agents are implementing.
- Completed-seven hashes: `validation/completed-baseline.json`; original 96 lesson artifact
  snapshot: `/tmp/postgres-pivot-original-lessons.json`.

## Next actions

1. Primary designs/implements chunk-2 retry and durable-claim protocols while agents finish chunk1.
2. Review returned owned files, build root PostgreSQL only, update cross-module prerequisites for
   retired slugs and verify completed-seven hashes. Guide registry belongs to primary.
3. Run staged CLI tests and independently rerun changed storage/horizon experiments, then full chunk
   sequence. Agents save real evidence in validation/01-*.md and raw logs in /tmp.
4. Refresh ordinal/checkpoint mapping, record evidence here, commit/push chunk1; dispatch next exact
   designs. Follow REWORK-PLAN for remaining chunks2–7; no stopping after first chunk.
5. User also explicitly requested durable knowledge-bank updates for future projects. Record
   reusable findings in repository docs/knowledge and index; keep transient task state here.
   Commit/push this handoff at meaningful updates; remove it in final cleanup after all work is
   complete.

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
