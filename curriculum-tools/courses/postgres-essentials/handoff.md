# PostgreSQL Essentials batch 7–10 handoff

Fresh run, 2026-09-07. Scope: fixed route lessons 7–10. Workflow recorded and committed first as
56aaace; CLAUDE.md already symlinks AGENTS.md. No prior course handoff existed.

- Design: designs/07-10.md. Primary owns lesson 10, shared integration, validation and commits.
- Sol A: lesson 7, curriculum/05-version-check.ts.
- Sol B: lessons 8–9, curriculum/06-write-skew.ts and 07-serializable.ts.
- Status: both Sol drafts exist and have received primary review requests. Primary implemented the
  supplied Python/psql retry client, lesson 10 and shell-aware renderer/validator dispatch.
  Registration caught and corrected an invented lesson-7 prerequisite in the lesson-8 draft. Ten
  lessons build and the three coach tests pass. Primary lesson-10 core and all three client cases
  pass against PostgreSQL 16: actual COMMIT 40001 then fresh read 1/stay; no-conflict success,
  budget exhaustion with status 2, and nonretryable 42P01 with status 1. All client schemas and both
  primary test clusters were removed. Primary took ownership of the Sol modules after review; agents
  are now limited to reporting and cleanup. Lessons 7 and 8 pass independent core and exact
  displayed variation checks. Lesson 9 and the full ten-lesson run remain pending. All 37 repository
  tests pass; copied-catalog refresh and 30 views preserve learner history.
- Knowledge checkpoint: docs/knowledge/postgres-essentials.md now records generalized lessons about
  stable prerequisites, shell dispatch, immediate psql evidence, scoped expected errors and
  raw-template/variation formatting. Update it again with measured acceptance findings.
- Resources: about 16 GB free, 6.9 GB available memory, 8% inodes used. Read-only learner query
  verified PostgreSQL 16.15 and /labs/pglab/primary. Sandbox socket access requires an escalated
  PostgreSQL command. Budget one private cluster below 200 MB, remove in finally.
- Preserve unrelated dirty files, both learner progress stores and root/unrelated handoffs.
- Open checks: authored evidence, variations, shell retry failure paths, renderer/build/tests,
  copied-progress refresh, live catalog availability, final cleanup and readiness.

Primary updates and commits this file at each checkpoint, then deletes and commits removal after
acceptance. Durable findings go in docs/knowledge/postgres-essentials.md.
