# PostgreSQL logical decoding and delivery evidence

Use explicit plugin/transaction modes, physical evidence and independent receiver outcomes when
teaching logical changes. These findings supplement the owned physical-replication notes.

## Committed output is neither XID order nor every row's WAL order (2026-09-05)

### What happened

Current78 uses a fresh owned wal_level=logical cluster and test_decoding with include-xids=1,
skip-empty-xacts=0 and stream-changes=0. One transaction inserts two rows, updates one and deletes
the other. Physical pg_walinspect records include heap operations, Btree work and one COMMIT;
logical output contains one six-event BEGIN/row/COMMIT envelope. Repeated peek retains the same
output/confirmation; get returns it and advances the cursor. Confirmation can pass non-row records,
so it need not equal the last printed logical event's LSN.

An older transaction writes ID800 and remains idle in transaction. A later transaction writes801 and
commits. The decoder returns the newer complete transaction while pg_stat_activity still shows the
older backend and XID open. A fresh query sees801 but not800. After the older client commits, its
events arrive. In the core, commit delivery is XID737 then736; variation738 then737. Actual row-LSN
comparison moves backward for the later-delivered old transaction, while its COMMIT LSN is later.
Full final rows/payloads agree with both committed transactions.

### Why it matters

The previous lesson's claim that a slow transaction delays everything behind it was contradicted by
its intended commit-order model and by this execution. Grouped transaction output does not imply
XID-ordered delivery. Nor does it imply that every row record's LSN increases in emitted order. An
application cannot treat an arbitrary row LSN as interchangeable with a transaction completion
boundary. The plugin/mode qualification matters: in-progress streaming and two-phase decoding have
different contracts, so omission of uncommitted/aborted work is not a universal CDC assertion.

### How to apply

Observe the older backend live at the moment the newer output is consumed. Preserve XIDs, full
transaction envelopes, row/COMMIT positions and independent table contents. Avoid a test that waits
for both commits and then infers whether the earlier open transaction blocked delivery. Source and
exact CLI evidence is in validation/05-logical-decoding.md. The next delivery lesson must establish
receiver commit and deduplication independently; advancing the source cursor cannot prove them.

## Aborted physical WAL requires an actual inspection flush boundary (2026-09-05)

### What happened

The rollback experiment initially failed pg_get_wal_records_info with “could not find a valid record
after 0/888D20”. The insert/abort and following restore-point record had been inserted, but the
prototype had not verified flush availability and had no successful synchronous COMMIT boundary.
This failure was consistent with inspecting an unflushed interval. The accepted experiment
checkpoints after each captured end marker and requires pg_current_wal_flush_lsn >= that marker
before physical inspection. It then finds the aborted XID's Heap/INSERT and Transaction/ABORT, no
COMMIT, no decoded events in the selected mode and no visible ID700. Checkpoint records are outside
the bounded interval and XID filtering excludes unrelated work.

### Why it matters

A real marker gives a record boundary; it does not itself prove the bytes reached disk. Inserted,
flushed, decoded and visible are distinct observations. Absence from logical committed output also
does not imply absence from physical WAL.

### How to apply

Establish the required WAL availability explicitly before inspecting an abort-only interval.
Separate the flush step from transaction-outcome evidence: flushing an ABORT does not commit the
row. Retain the physical XID filter and independent logical/table checks. Do not diagnose missing
physical records from an unverified flush boundary as evidence that rollback generated no WAL.

## Schema awareness and old-row identity are separate contracts (2026-09-05)

### What happened

With skip-empty-xacts=0, committed ADD COLUMN emits only an empty BEGIN/COMMIT envelope. A later row
carries extra[text]:'v2', and information_schema confirms the added column. No ALTER TABLE statement
is supplied to a consumer. DEFAULT identity on this primary-key table gives the update's new tuple
and the delete's key only. The FULL variation includes the old note/value on UPDATE and DELETE, with
exact text assertions and the same final table. The former unconditional challenge claim that
REPLICA IDENTITY NOTHING must reject UPDATE was removed from this lesson; the new variation
exercises DEFAULT/FULL without inventing a publication/subscriber.

### Why it matters

The decoder can know the current row shape without transporting a migration command. Before-image
requirements and schema evolution therefore need separate consumer policies. An example text plugin
is not a complete replication or business-delivery protocol.

### How to apply

Name the actual plugin/options and assert both emitted and omitted information. Supply a meaningful
schema change followed by a row using it, rather than declaring DDL invisible without observing its
transaction envelope and later effects. Vary identity on a controlled workload before drawing
conclusions about the available old values.

References: PostgreSQL16 [test_decoding](https://www.postgresql.org/docs/16/test-decoding.html),
[logical decoding concepts](https://www.postgresql.org/docs/16/logicaldecoding-explanation.html),
[output plugins](https://www.postgresql.org/docs/16/logicaldecoding-output-plugin.html) and
[pg_walinspect](https://www.postgresql.org/docs/16/pgwalinspect.html). Numeric results above are
executed local evidence, not promised values for another run.
