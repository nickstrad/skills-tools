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

Checkpoint: Sol A's lesson 12 reviewed and independently accepted with the shared runner. Core
observed transactionid wait, inserted counts 1/0/0, matched receipt, rejected amount 55,
request_rows=1 and credited_total=40. Self-contained rollback variation observed wait then B=1.
Evidence: validation/lessons-12-{outcomes,source,cleanup}.json plus author report/controllers. Both
author and primary private labs removed. Catalog built through 12; no live refresh yet. Lessons
13–15 review feedback is with Sol B: complete variation labels, immediate SQLSTATE, explicit
survivor identity, reset semantics and pool handling. Availability docs drafted for final.

Checkpoint: lessons 13–15 primary-reviewed, corrected and accepted on exact built source. L13
core/rollback variation observed PID edges and balances 130/120. L14 corrected contribution
assignment identifies whole survivors; standalone detector probes validated both A victim ({1,1})
and B victim ({10,10}); consistent order still waits and finishes {11,11}. L15 exact
55P03/25P02/57014/25P02 sequence leaves balance 100; autocommit variation recovers immediately.

All 15 available lessons and runnable variations passed the full private-cluster run. Eight primary
validation roots have been retired, with no learner-history change; small JSON/log evidence remains.
Full source manifest includes both supplied clients. First ten lesson objects remain byte-for-byte
identical after JSON parsing. Deno checks and all 37 tests pass; a renderer assertion was narrowed
to core review so self-contained optional variations may legitimately recreate their fixture.

Remaining: live catalog refresh after copied refresh gate, final rendering/readiness/resource audit,
acceptance documentation, and removal of this handoff in the completion commit.
