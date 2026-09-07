# Lessons 11–15 batch handoff

Scope: fixed PostgreSQL Essentials route 11–15, requested 2026-09-07. Design: designs/11-15.md.
Primary owns lesson 11/client, shared integration, validation and commits. Sol A owns lesson 12; Sol
B owns lessons 13–15. Existing unrelated dirty files are protected. Preflight: ~16 GB available, 7.8
GiB memory with ~6.7 GiB available; learner PID 348739, /labs/pglab/primary with active learner
terminals. CLAUDE.md remains linked to AGENTS.md. Peak validation budget <600 MB, no retained
database images. Implementation and acceptance pending.

Checkpoint: lesson 11 implemented and independently validated on PostgreSQL 16. Core: caller
UNKNOWN, reconnected balance 110, unsafe repeat 120. Before-COMMIT variation: 100 then 110. Real
undefined-table service failure: exactly one attempted write, no replay, schema cleaned. Evidence:
validation/lessons-11-{outcomes,source,cleanup}.json. Owned validation root removed; both progress
databases unchanged. Lessons 12–15 remain with their assigned Sol authors. Catalog currently built
through 11 for this acceptance checkpoint; live catalog not refreshed yet.
