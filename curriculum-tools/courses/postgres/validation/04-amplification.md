# WAL amplification acceptance

Primary acceptance2026-09-05. Replaced wal-size-of-operations (current57) at revision4 with a fresh
owned-cluster shell experiment and exact guarded-no-op comparison. Primary designed, implemented and
reviewed every live result. A bounded Terra/high read-only review found no concrete defects; primary
adopted precise zero-row UPDATE wording (it can still acquire a write lock).

## Final executed evidence

All ingestion fixtures have fresh matching unindexed heap definitions. All populate the same200
IDs1–200, amount=id, forty-character x payloads. Null-safe exact-value checks,
count/distinct/min/max and sum20100 pass. SQL files make transaction boundaries explicit; COPY
consumes client STDIN terminated by backslash-dot, with no shared server CSV pathname.

| Method                       | Owned heap-record bytes | Commit records/bytes | Whole interval bytes |
| ---------------------------- | ----------------------: | -------------------: | -------------------: |
| INSERT SELECT                |                  20,800 |                 1/34 |               59,416 |
| 200 INSERTs, one transaction |                  20,800 |                 1/34 |               42,336 |
| 200 autocommit INSERTs       |                  20,800 |            200/6,800 |               43,616 |
| COPY, one transaction        |                  11,845 |                 1/34 |               30,344 |

Each INSERT path has200 target heap records, while COPY has5 Heap2 MULTI_INSERT+INIT records. The
whole intervals contain unequal catalog hint-image overhead despite identical initial heap layouts:
38,004/21,148/14,512/18,164 image bytes respectively. Primary found this in the first run and added
owned-heap and commit byte fields before final acceptance. Do not rank intrinsic method cost from
these tiny whole-interval totals. Commit decisions are not physical fsync counts.

Matched primary-key fixtures with and without an amount index both produce200 updated rows,
amount20300 and no bad values. Plain:200 HOT,31,510 owned heap-record bytes,31,856 interval.
Indexed:0 HOT,31,510 owned heap-record bytes,65,664 interval, plus400 B-tree INSERT_LEAF records.
The index case still maintains the primary-key index when its non-HOT update creates new tuple
locations. A separate valid/ready index build preserves all200 original rows and reports16,384 index
bytes versus72,232 interval WAL bytes, including catalog/page work.

Source and exact CLI no-op comparisons both preserve all200 values/amount20100. Unconditional: 200
HOT updates,30,925 heap-record bytes,31,832 interval, one34-byte COMMIT. Guarded:zero heap
updates,zero COMMIT records,zero interval bytes. Equal endpoints bypass the decoder instead of
asking it to locate a record that does not exist. This fixture has no trigger/per-attempt side
effects; guard equivalence needs those assumptions in a real application.

All servers stopped. Final core /tmp/pg-amplification-core.log, /tmp/pg-owned-4573r03w; final source
variation /tmp/pg-amplification-variation.log, /tmp/pg-owned-tpq4t7lj; exact copied-catalog hint
/tmp/pg-amplification-exact-wal-size-of-operations.log, /tmp/pg-owned-g3_ms5wq. Each owned directory
retains SQL scripts, detailed bounded WAL records and results.json. Rendered hint:
/tmp/pg-amplification-rendered-wal-size-of-operations.md. Drivers:
/tmp/pg-amplification-{core,variation}.sh, /tmp/pg-amplification-exact.ts/.sh.

## Integration

Thirty engine/validation/coaching tests pass (/tmp/pg-amplification-tests.log); full repository
check passes (/tmp/pg-amplification-check.log). Actual isolated build changes only
wal-size-of-operations. 94 lessons, seven reading stops, first7/capacity unchanged from accepted
HEAD; fresh copied catalog preserves all IDs, progress and attempts with the replay-only slug still
inactive. Real learner DB SHA256 during
check:395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Scoped builder /tmp/pg-amplification-scoped-build.py and /tmp/pg-crash-progress.py were used. Other
workstream's storage source/artifact coordination remains outside this acceptance. No learner
cluster or progress mutation. WAL module is now accepted; all checkpoint/restore lessons remain
pending design04 work. No throughput, power-loss or recovery-duration claim is inferred here.
