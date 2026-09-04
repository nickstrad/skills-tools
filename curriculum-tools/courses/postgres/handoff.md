# PostgreSQL pivot handoff

Updated 2026-09-04. **Active: chunk 1 integration review; chunk 2 bounded implementation.**

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
- All three chunk1 agents returned implementations and private validation. They are not yet
  committed as an integrated lesson change. Primary review and combined-course validation remain.
- Active unrelated SQLite changes include its course, generated lessons, shared `src/main.ts`,
  `tests/main_test.ts`, bootstrap and Docker scripts. Never stage these with PostgreSQL changes.
- Shared-engine work includes slug-preserving progress reseeding. Do not edit those files; verify
  integration on a copied progress database when that work lands.
- Plan has chunks 0–7. Exact designs are authored by the primary before delegation, not left to
  agents.
- Active Terra/high agents now follow designs/02-concurrent-clients.md: `guided_cli` owns
  curriculum/05-isolation.ts, guides/05-isolation.ts and validation/02-isolation.md; `visibility`
  owns the analogous 06-locking files. `storage` is doing a read-only review of worker-protocol.ts.
  Primary owns client-protocol.ts, worker-protocol.ts and guide registry integration. Agents never
  commit or build the root generated artifact. The isolation agent must coordinate runtime use of
  pivot_primary with the primary; the locking agent uses pivot_visibility.
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
  an apostrophe in the temporary progress path; primary review remains.
- Primary retry protocol prototype passed a controlled SQLSTATE40001 followed by a fresh successful
  transaction and exactly one effect. Base result95|1; competitor+20 variation110|1. Scripts:
  /tmp/pg-pivot-retry.sh and /tmp/pg-pivot-retry-variation.sh; evidence directories
  /tmp/pg-retry-Potk2s and /tmp/pg-retry-yCqb11. Source client-protocol.ts is not yet integrated.
- Primary worker-protocol.ts passes formatting/typecheck; runtime validation and takeover-race
  review remain. It models short durable claims, generation checks, stale completion and rollback.
- Completed-seven hashes: `validation/completed-baseline.json`; original 96 lesson artifact
  snapshot: `/tmp/postgres-pivot-original-lessons.json`.

## Next actions

1. Primary finishes chunk1 integration and validates the worker protocol while agents implement the
   bounded chunk2 isolation/locking contract. Unknown-commit protocol remains primary work.
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
- Chunk1 reports and protocol prototypes above are implementation evidence, not final course
  acceptance. User status questions have been answered explicitly: the overall refactor is not done;
  repo-wide guidance is pushed, chunk1 awaits integrated review, and chunks2–7 remain.
