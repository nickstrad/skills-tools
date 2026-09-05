# Physical WAL and logical decoding acceptance

Primary acceptance, 2026-09-05. Current78 decode-the-log is revision4. Fresh owned logical-WAL
cluster, exact physical/XID and logical-event comparisons, and one concurrent open transaction. The
variation changes replica identity from DEFAULT to FULL without changing the workload.

## Live evidence

Final core: /tmp/pg-logical-decoding-core.log, root /tmp/pg-owned-fujhcb1t. Final source variation:
/tmp/pg-logical-decoding-variation.log, root /tmp/pg-owned-m69mnmnr. Driver:
/tmp/pg-logical-decoding-validate.ts; scripts /tmp/pg-logical-decoding-{core,variation}.sh.

The named logical slot uses test_decoding in database postgres, with explicit include-xids=1,
skip-empty-xacts=0 and stream-changes=0. Core committed XID732 (FULL733) inserts IDs1,2, updates1
and deletes2. Physical records include heap INSERT/HOT_UPDATE/DELETE, Btree work and one COMMIT.
Exactly six logical events share that XID: BEGIN, two INSERTs, UPDATE, DELETE, COMMIT. Two peeks
return identical events with confirmation unchanged; get returns the same events, advances
confirmation and leaves the next get empty. DEFAULT update contains the new row and delete only ID2;
FULL includes old note/value10 on update and deleted note/value20. Every event string is checked.

Aborted XID733 (FULL734) has physical Heap/INSERT and Transaction/ABORT but no COMMIT. No logical
event or visible ID700 survives. Physical intervals end at real restore-point markers; a checkpoint
and flush>=marker assertion precede inspection. The initial prototype lacked this availability gate
and failed to find a valid record after0/888D20 on the abort-only interval. The final design
distinguishes record insertion from verified disk availability before drawing absence conclusions.

Committed ADD COLUMN has only a two-event BEGIN/COMMIT envelope. A subsequent INSERT701 explicitly
contains extra[text]:'v2'; information_schema confirms id,note,value,extra. The stream conveys the
new row shape without an ALTER TABLE command.

In the core, older XID736 inserts800 and remains idle in transaction. Newer737 inserts801 and
commits; its three events are consumed while the older backend still has XID736 open. Independent
rows include801 but not800. After older COMMIT/normal client exit, its three events arrive. FULL
repeats with738 delivered before737. A SQL assertion proves the later-delivered older row's LSN is
earlier than the newer row's LSN, while its COMMIT LSN is later. Thus actual delivery contradicts
both XID-order inference and monotonically increasing individual row-LSN inference.

Final exact contents in both runs: ID1/kept/value11/extra NULL; ID701/after ddl/value71/extra v2;
ID800/started first/value8/extra NULL; ID801/committed first/value9/extra NULL. IDs2/700 are absent.
All owned clients and servers stop and the named logical slot is removed.

## Integration and limits

Exact copied-catalog current78 hint2: /tmp/pg-logical-decoding-rendered-decode-the-log.md. Output:
/tmp/pg-logical-decoding-exact-decode-the-log.log; root /tmp/pg-owned-00fy24ya. It reproduces FULL
before-images, physical commit/abort evidence, DDL envelope/new-column row, actual older-open
newer-delivery state, row/COMMIT ordering and complete table/cleanup assertions.

Thirty tests/full formatting/lint/typecheck pass in /tmp/pg-logical-decoding-{tests,check}.log.
Isolated builder /tmp/pg-logical-decoding-scoped-build.py changes only current78 among93 lessons.
Fresh copied catalog /tmp/pg-observe-progress-6bd71yv6/progress.sqlite preserves
IDs/progress/attempts; first seven, capacity and seven reading stops remain intact. Learner hash is
unchanged: 395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Claims apply to the selected example-plugin non-streaming mode. Streaming in-progress changes and
two-phase modes are outside this execution. No publication/subscription or independently committed
consumer effect is simulated. Source-slot consumption alone does not prove delivery to an external
application. Schema compatibility and old-row requirements are separate policies. No byte-cost or
throughput claim follows from this tiny physical/logical comparison.

Reusable findings: docs/knowledge/postgres-logical-evidence.md. Next: current79
slot-position-and-acknowledgement, with real independent receiver effects, response loss
before/after acknowledgement, replay and deduplication; then the rest of logical processing,
chunks6–7 and audit.
