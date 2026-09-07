# PostgreSQL Essentials batch 7–10 handoff

Fresh run, 2026-09-07. Scope: fixed route lessons 7–10. Workflow recorded and committed
first as 56aaace; CLAUDE.md already symlinks AGENTS.md. No prior course handoff existed.

- Design: designs/07-10.md. Primary owns lesson 10, shared integration, validation and commits.
- Sol A: lesson 7, curriculum/05-version-check.ts.
- Sol B: lessons 8–9, curriculum/06-write-skew.ts and 07-serializable.ts.
- Status: design ready; implementation and real acceptance pending.
- Resources: about 16 GB free, 6.9 GB available memory, 8% inodes used. Read-only learner
  query verified PostgreSQL 16.15 and /labs/pglab/primary. Sandbox socket access requires
  an escalated PostgreSQL command. Budget one private cluster below 200 MB, remove in finally.
- Preserve unrelated dirty files, both learner progress stores and root/unrelated handoffs.
- Open checks: authored evidence, variations, shell retry failure paths, renderer/build/tests,
  copied-progress refresh, live catalog availability, final cleanup and readiness.

Primary updates and commits this file at each checkpoint, then deletes and commits removal
after acceptance. Durable findings go in docs/knowledge/postgres-essentials.md.
