# Batch three acceptance: lessons 7–10

Accepted 2026-09-07 against PostgreSQL 16.15. The fixed route now has ten available lessons. The
primary designed the batch, delegated 7 to one Sol agent and 8–9 to another, reviewed every
submission, corrected the evidence/presentation issues, and implemented the retry client directly.
The durable process is [lesson-batch-workflow.md](../../../../docs/lesson-batch-workflow.md).

## Measured evidence

| Lesson | Core outcome                                                                                                                               | Additional check                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7      | Both editors read version 1; save counts 1, 0, 1; final body preserves A's text and B's reviewed addition at version 3.                    | Resubmitting original token 1 changes zero rows and preserves version 3.                                                                              |
| 8      | Both RR reads count 2, both disjoint updates affect 1, both COMMITs return 00000, final on-call count 0.                                   | Serial schedule makes B read 1 and decline; final count 1.                                                                                            |
| 9      | Same reads/writes; A commits, B COMMIT returns 40001; Alice is off call, Bob remains, count 1.                                             | Serial schedule makes B decline and commit without an error.                                                                                          |
| 10     | B attempt 1 reads 2/leaves but fails at COMMIT with 40001; attempt 2 reads 1/stays and commits. Independent final rows are Alice=f, Bob=t. | No-conflict success exits 0; one-attempt exhaustion exits 2; actual undefined-table error 42P01 exits 1 with no retry. Every case removes its schema. |

The exact built lessons 7, 8, 9 and 10 were each run independently in primary-owned clusters. Then
all ten lessons ran together, including each new SQL variation and the retry cases. The course
runner uses the shared persistent Session/splitSteps implementation, including observed lock waits
for existing lessons 5–6. It executes shell lessons with shell status checks. SQL variations are
extracted from the displayed Markdown code blocks and preserve terminal labels.

The validator permits exactly one B-session ERROR 40001 in lesson 9 and checks its immediate COMMIT
state, provisional row counts and final committed rows. Its explicit ROLLBACK prints the expected
25P01 warning because the failed COMMIT already ended the transaction. No other SQL error is
accepted. The retry client's errors are structured records from immediate psql SQLSTATE responses;
successful earlier statements do not count as successful commits.

Final evidence:

- [Full-catalog outcomes](lessons-1-2-3-4-5-6-7-8-9-10-outcomes.json)
- [Accepted lesson and supplied-client hashes](lessons-1-2-3-4-5-6-7-8-9-10-source.json)
- [Full-run cleanup](lessons-1-2-3-4-5-6-7-8-9-10-cleanup.json)
- Per-lesson `lessons-7-*`, `lessons-8-*`, `lessons-9-*` and `lessons-10-*` records
- [Catalog refresh and history preservation](batch-three-progress.json)

The standalone lesson-10 run preceded adding its supporting-file hash field; the final full-run
manifest includes the exact accepted `lab/retry.py` hash. Earlier lesson-10 core/variation outcomes
remain consistent with that full run. Small ignored `.log` files remain beside the JSON records; no
database image, backup, replica, archive or scratch progress copy is retained.

## Review and integration

Primary changes included resolving a draft prerequisite against the fixed slug list, printing
ROW_COUNT/SQLSTATE before another command overwrites them, using one captured reread for both the
optimistic-edit evidence and merge token, correcting raw-template backslashes, and making variation
blocks runnable. Serializable's discussion limits its guarantee to participating transactions that
enforce the rule. Retry is a client policy; it need not fulfill the original mutation or run forever
to preserve the invariant.

The course build, full `deno task check` and all 37 `deno task test` tests pass. Coaching tests
check all ten route identities, diagrams before commands, exact rendered SQL/shell commands,
explicit progress writes and the pending lesson-11 boundary. The first six built lesson objects are
identical to their pre-batch versions, including revisions and commands.

`refresh.py` first refreshed a SQLite backup and checked all 30 views. Its `--apply` run repeated
the copy gate before refreshing the learner catalog, preserving the four completion and four attempt
rows present then. The learner advanced during this authoring run; the earlier copied check had
three rows. No completion was recorded by this work. Reference progress content and its WAL
fingerprint stayed unchanged. The temporary backup was removed.

## Resource closure and limits

All six primary validation roots were stopped normally and removed, as were both agents' labs and an
empty failed agent allocation. Independent final path checks confirmed their absence. The host
process check shows only the existing learner cluster and its clients. A read-only query still
resolves `/labs/pglab/primary`, returns PostgreSQL 16.15 and finds zero author-client labels. Final
resources: about 16 GB free, 33% filesystem usage and 6.8 GiB available memory. The learner's active
sessions and unrelated work remain intact.

The primary ran one small cluster at a time; the agents briefly validated concurrently in separate
clusters within the measured headroom. No shared cluster restart or learner mutation was used.
Retained evidence is small, reproducible source/outcome documentation with no pending bulky
retention obligation. Lesson timings remain 25-minute estimates within the chosen 20–30 minute
range; learner pacing is not established by automated runtime. This is local transaction-boundary
evidence, not a network-failure or external-effect replay test.
