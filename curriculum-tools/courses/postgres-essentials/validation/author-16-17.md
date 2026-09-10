# Lessons 16–17 author validation

Accepted on 2026-09-10 against a private PostgreSQL 16 cluster. The source-driven runner imported
`curriculum/14-plans.ts`, executed each lesson's exact `setup + code`, extracted each optional
fenced SQL variation from `challenge`, and used `psql -X -v ON_ERROR_STOP=1`. All four runs ended
with their fixture dropped and both session guards reset; no SQL error occurred.

Lesson 16 printed `plan_prediction`, `measured_execution`, and `repeated_execution` immediately
before their plans. Plain EXPLAIN predicted one Aggregate row and 50 Seq Scan rows. Both measured
plans emitted one Aggregate row and 100 scan rows, removed 9,900 rows in one loop, and reported 84
shared hits. The independently runnable broader-predicate variation emitted 1,000 scan rows and
removed 9,000 in one loop.

Lesson 17 began with MCV frequencies `{common,rare}={0.9,0.1}`. After the controlled update, live
counts were common=1,000 and rare=9,000. The `stale_statistics` scan estimated 1,798 rows but
emitted 9,000; after ANALYZE, MCV order/frequencies were `{rare,common}={0.9,0.1}` and
`refreshed_statistics` estimated and emitted 9,000. The reverse-skew variation held 1,000 rare rows:
its stale estimate was 16,036, and explicit ANALYZE repaired it to 1,000; both scans removed 9,000.

The compact machine-readable outcomes are in `author-16-17-outcomes.json`. Its source hash is
`5d7797c4b23254801f6207c9dfa94a1efde06d6e8bb87b537dc7a397454f5ff3`; the runner hash is
`37454760d9b9a2e754000c7c89b1e47c9c5d89e528d3667aa1c4293c86d330f5`. Buffer counts are recorded as
run evidence, while lesson prose treats buffer placement and sampled estimates as variable.

The owned cluster root was `/tmp/pg-essentials-validation-author-16-17-lfNrFM`, used port 6547 with
a Unix-only socket and 16MB shared buffers, and was removed after normal shutdown. The learner
cluster was neither targeted nor written. Final checks found 16GB filesystem space available and no
retained author cluster.
