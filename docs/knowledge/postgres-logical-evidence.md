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

## Source acknowledgement and receiver effect commit independently (2026-09-05)

### What happened

Current79 initializes separate source and receiver PostgreSQL processes with
different system identifiers and private data/socket paths. The unsafe trial
consumes source IDs1,2 with get, then kills a receiver psql client while its
attempted receipts and balance update remain uncommitted. The backend
disappears, independent receiver queries show no effect and total0, and the
source's next read is empty while its rows remain. These missing effects are
preserved as failure evidence, not silently included in the later safe
protocol's success.

The safe receiver function inserts an immutable origin/event-ID receipt and
credits its delta in the same transaction. A duplicate inserts nothing and
changes no balance; a duplicate identity with a different payload raises22000.
The source's ten-event transaction returns12 envelope rows despite a five-change
request. Repeated peeks leave confirmation unchanged. Killing its first receiver
attempt before COMMIT rolls back all receipts and credits; the whole source
batch remains available. Killing a later client after receiver COMMIT but before
source acknowledgement leaves ten receipts and total145. Fresh source replay
followed by receiver retry applies0 new effects and preserves145.

A later source transaction contains20,21. Acknowledgement advances only through
the first complete transaction's COMMIT LSN, leaving20,21 pending even after the
source acknowledgement client is killed. Final safe delivery matches all
IDs10–21 and total186 on both sides, including after an actual receiver restart.
All owned clients/servers stop and source slots drop. Report:
validation/05-slot-delivery.md.

### Why it matters

A source offset does not encode receiver success. Receipt and effect must share
a receiver commit; a receipt written independently could survive without its
intended effect. A row position, or the newest source WAL position, is not a
safe replacement for the completed transaction actually applied. The receipt
identity must remain immutable, and deduplication state must cover the possible
replay horizon. This fixture has one consumer and one narrow INSERT schema, not
an arbitrary CDC protocol.

### How to apply

Inject failure at actual client/database boundaries and read each server
independently afterward. The harness's psql markers schedule the kills; backend
state, receipts, totals and source cursor queries prove outcomes. Describe this
as controlled client-process loss, without implying a network packet-loss
mechanism was exercised. Keep deliberately lost effects separately inventoried.
A single-host pair establishes independent transactions and processes, not
independent host failure or a distributed atomic commit.

## Checkpointed slot state can replay already-acknowledged work (2026-09-05)

### What happened

The source checkpoints before the first safe acknowledgement. Slot confirmation
is0/8615D0; the worker advances it to the first transaction's COMMIT at0/861B60.
The harness verifies that state, kills the acknowledging client and confirms
only the later batch remains. In the variation, an immediate source stop happens
before another checkpoint persists the advanced position. The independent
receiver stays live with ten receipts and total145. Source restart preserves its
system identity but restores confirmation0/8615D0 and actually replays the
already-acknowledged first batch. Applying those events again creates0 receipts
and no extra credit; acknowledging the same COMMIT again preserves the later
batch, which then finishes total186.

### Why it matters

The previous absolute claims that get is irreversible or guarantees at-most-once
delivery were too strong. Immediate rereads can be empty while crash recovery
can still replay acknowledged changes. Checkpoint persistence, source delivery
and receiver commit are distinct boundaries. Deduplication must not be discarded
merely because acknowledgement was observed. This trial deliberately controls
the checkpoint window; it does not predict that every source crash will move a
slot backward.

### How to apply

Save the pre-acknowledgement slot state, control the checkpoint interval and
actually compare recovered positions before claiming replay. Keep the receiver
independently queryable through source failure. Require replayed payloads to
equal the original complete batch and verify zero duplicate credit before
advancing again. See PostgreSQL16
[slot administration functions](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-REPLICATION)
and
[logical decoding concepts](https://www.postgresql.org/docs/16/logicaldecoding-explanation.html).

## Audit the actual COPY snapshot separately from its change tail (2026-09-05)

### What happened

Current80 now consolidates publication-and-subscription and initial-sync-vs-streaming. A subscriber
replica row trigger pauses the actual COPY worker after receiving its first seed row. The observed
worker waits on the held advisory lock, owns a local transaction ID, and its relation is in state d.
Independent reads see no copied rows or audit entries yet. While held, the source commits two
batches, each containing ten updates, one delete and one insert. After release, the audit contains
exactly100 original seed images under the blocked worker's XID and24 later changes in two different
transactions. The four-batch variation instead records48 changes in four transactions. Full payloads
and membership agree, including copied old versions of updated/deleted seed rows.

The experiment then adds a second publication table. Publisher membership alone leaves it absent
from pg_subscription_rel; REFRESH registers it and starts a separate copy. While that copy is held,
a new receipt still applies to the already-ready first table. Both copies pass their own snapshot,
tail, readiness and post-ready receipt checks. Final inventories contain102 item rows and101 ledger
rows, with every value/note compared. No shared snapshot across both table bootstraps is claimed.

### Why it matters

Matching final counts can hide missing updates or balanced omissions/duplicates. The local audit
separates actual copied row versions from later changes, while the observed worker XID ties the
copied image to the original blocked transaction. A later retry could choose a different snapshot;
never silently accept a retried copy as proof about the first attempt. Publisher membership,
subscriber relation registration and readiness are separate events.

### How to apply

Use a deterministic gate inside real copy work and assert its live wait before creating overlap.
Retain source COMMIT records, full before/after images and complete independent table answers.
Require a new post-ready receipt behind the actual apply-origin COMMIT boundary. The replica trigger
is instrumentation and changes timing/write cost; no throughput or production-trigger advice follows.
See validation/05-logical-bootstrap.md and PostgreSQL16's
[logical replication architecture](https://www.postgresql.org/docs/16/logical-replication-architecture.html).

## Worker environment and synchronization fields need direct evidence (2026-09-05)

### What happened

The first bootstrap prototype used an unqualified INSERT into bootstrap_audit inside its trigger.
The actual worker failed with relation-does-not-exist even though an interactive connection could
read the table. Schema-qualifying public.bootstrap_audit fixed it. The final trigger records
current_setting('search_path'); both COPY and later apply returned the empty string in all three
accepted runs. Final subscription apply/sync error counters are zero. The failed prototype and its
retries are retained separately at /tmp/pg-owned-s9kmqv0v.

Each held COPY had its own generated pgoutput synchronization slot, separate from the main slot.
The sampled sync slot was temporary=false and active=false despite the live blocked COPY worker.
It disappeared after synchronization. The relation's srsublsn was NULL during d and non-null in r.
The main replication origin then reached the captured source COMMIT end for a newly streamed receipt.

### Why it matters

An interactive search_path is not evidence about the worker's execution environment. Short-lived
synchronization slots are not necessarily temporary slots or continuously active consumers. Nor is
srsublsn a universal snapshot LSN: PostgreSQL documents it as state-change synchronization
coordination in s/r. Transport received_lsn, origin remote_lsn and per-table readiness describe
different boundaries; none replaces full data checks.

### How to apply

Qualify trigger references used by logical workers and capture the setting when diagnosing failures.
Record slot lifetime and flags separately. Gate on observed d/r states without requiring every brief
intermediate state to be sampled. Use the relevant origin's remote_lsn plus fresh domain queries for
post-ready work, while retaining per-table readiness during multi-table bootstrap. References:
[pg_subscription_rel](https://www.postgresql.org/docs/16/catalog-pg-subscription-rel.html) and
[pg_replication_origin_status](https://www.postgresql.org/docs/16/view-pg-replication-origin-status.html).

## Conflict finish LSN and apply COMMIT end are different boundaries (2026-09-05)

### What happened

Current81's first prototype compared the subscriber log's finished-at LSN with the physical COMMIT
end and failed. Captured source XID737 instead had COMMIT start0/88B158/end0/88B188, while the actual
23505 log named0/88B158. The corrected experiment checks finish against start, uses that exact logged
value for ALTER SUBSCRIPTION SKIP and reserves end for its apply-origin gate. The schema failure
similarly logged0/8900B0, matching COMMIT start rather than end0/8900E0. Core, source variation and
exact rendered variation reproduce these relationships on PostgreSQL16 with streaming=off.

### Why it matters

A diagnostic transaction identity and an applied-through boundary need not be interchangeable.
Using a plausible neighboring position can silently change the intended recovery command. The
original lesson also described direct origin advancement as if it used the identical argument;
that unexecuted alternative has been removed from the lesson. PostgreSQL documents a different
next-LSN argument for direct pg_replication_origin_advance, so it should not be taught as an alias
for SKIP.

### How to apply

Capture the source XID and exact physical record start/end, preserve the matching new error context
and execute the chosen recovery command. Use the logged finish for SKIP, then verify later complete
transaction application using the COMMIT-end/origin gate and independent row contents. See
[logical conflicts](https://www.postgresql.org/docs/16/logical-replication-conflicts.html) and
[ALTER SUBSCRIPTION](https://www.postgresql.org/docs/16/sql-altersubscription.html). The experiment
uses ordinary committed transactions, not prepared transactions or parallel in-progress apply.

## Skipping an obstruction restores progress before it restores data (2026-09-05)

### What happened

The source transaction updates1, deletes2, inserts610 and finally collides with subscriber-local600.
Actual23505 rolls back all local effects: old1 and2 remain,610 is absent and600 keeps its local999
payload. Explicit disable_on_error=true leaves the subscription disabled with no worker and its
source slot inactive. Source601/602 still commit while origin/confirmation stay fixed and the target
lacks those rows. Core preserves local600 in a separate evidence table, deletes it from the replicated
table and enables replay. The complete failed transaction and later backlog then apply.

The variation uses the same workload but skips the failed transaction. Origin reaches0/88B318 and
601/602 exist, yet full comparison finds exactly IDs1,2,600,610 inconsistent. Error count stays1.
With apply stopped and all driver-owned source writes paused, a declared source-authority repair
removes2 and upserts the inventoried source rows1,600,610 atomically. Only afterward does full equality
hold. A fresh700 receipt proves continued apply. The discarded local600/value999 remains in evidence.

Source-only ADD COLUMN priority then causes an actual55000 missing-column failure when a new UPDATE
and INSERT arrive. Source801 commits behind it;800/801 remain absent locally and the old note on1
survives. Matching target DDL and ENABLE replay the queued transactions. A later900 receipt and all
ten final row payloads agree. Cumulative counters finish2 apply/0 sync, not zero. Raw logs contain
exactly these two classified errors in each accepted run.

### Why it matters

Skipping the whole transaction omits its non-conflicting changes too. A running worker, later receipt
or advancing origin can therefore coexist with extra, missing and wrong rows. Fixing only the
collision row after SKIP leaves three other discrepancies. The authority and pause boundary are
part of reconciliation, not optional operational details. Source DDL also does not migrate target
schema; connection health cannot establish row-shape compatibility.

### How to apply

Preserve disputed local values and inventory the entire skipped transaction. Establish who owns the
answer and how writers/apply are controlled before modifying target data. Compare full payloads and
require fresh post-repair work. Use actual schema failure and retained-transaction replay to validate
a migration repair, not just an ALTER TABLE success message. See validation/05-logical-conflicts.md
and PostgreSQL16's
[logical replication restrictions](https://www.postgresql.org/docs/16/logical-replication-restrictions.html).

## A recreated slot name does not restore its deleted decoding position (2026-09-05)

### What happened

Current82 pauses an independent logical subscriber. Published UPDATE/DELETE/INSERT plus four bounded
unpublished churn batches leave restart/confirmation fixed, an unconfirmed WAL interval above3MB and
the required segment still present after CHECKPOINT. Segment count stays8 in the final runs; interval
growth does not require immediate file-count growth. Resuming the original slot replays all changes,
a fresh91 receipt applies and confirmation advances through its COMMIT end.

A second paused interval updates1, deletes2 and inserts600. A source1000 row also commits and is then
deleted in a separate transaction; its independently visible intermediate image is retained. Dropping
the still-needed source slot removes its catalog state while the subscriber retains the name and
origin. Actual streaming startup then fails because the slot is absent. Recreating owned_retention
returns a new position beyond every gap commit; the old origin remains unchanged. All three old
COMMIT records are still physically inspectable. Yet the restarted stream applies new900 while full
comparison still finds stale1, extra2 and missing600.

### Why it matters

The slot name, consumer origin and physical availability of WAL are different facts. A new logical
slot does not recover its predecessor's decoding context merely by reusing its name or seeing older
files. Conversely, pausing a consumer with its original viable slot intact can preserve pending
changes. This experiment uses explicit slot removal; it does not duplicate the earlier physical
retention lesson's invalidation workload.

### How to apply

Save slot restart, confirmation, catalog horizon and independent data before lifecycle changes.
Measure actual acknowledgement and post-resume effects. If a slot is discarded, declare the gap and
verify the replacement's starting point. Do not treat a newly flowing stream or still-present WAL
files as proof that prior work arrived. See validation/05-logical-resnapshot.md and
[logical decoding concepts](https://www.postgresql.org/docs/16/logicaldecoding-explanation.html).

## Missing-slot startup can leave apply error counters at zero (2026-09-05)

### What happened

The missing-slot attempt logs08P01 on the subscriber and a corresponding source slot-does-not-exist
error. The worker exits. Despite disable_on_error=true, subenabled remains true and both
apply_error_count/sync_error_count remain0 at that observed boundary. The driver explicitly disables
and waits for no workers before recreating the slot. All three final runs assert these states and
retain the new log region; this is separate from the actual data-apply errors exercised in current81.

### Why it matters

Connection/startup failure is not the same path as applying a received transaction. Zero apply/sync
counters and a configured disable-on-error policy do not establish a healthy stream or guarantee
that every failure disables it automatically.

### How to apply

Combine logs, enabled state, live workers and actual post-commit data probes. Classify the error before
choosing a repair. When a controlled test expects a connection failure, explicitly stop its retry
lifecycle and preserve the failure evidence rather than waiting for a data-apply counter to change.

## Publication refresh is not resnapshot, and resnapshot is not event-history recovery (2026-09-05)

### What happened

The variation executes REFRESH PUBLICATION(copy_data=true) on the existing subscription after its
slot is recreated. The already-ready table's relation state remains unchanged. Receipt901 applies,
but the same three differences1/2/600 remain. The control omits only REFRESH and observes the same
result. PostgreSQL's documented refresh behavior copies newly registered tables, not every table
already known to the subscription.

Actual recovery pauses all driver-owned source writes and apply, preserves the stale target in a
separate table, drops the old subscription/origin and replacement slot, empties the target and starts
a new subscription with a new owned_resnapshot slot. Generation2 audit INSERT images equal the
saved source snapshot. A later902 receipt passes the new origin's COMMIT-end gate. All15 final rows
and payloads agree; stale1, extra2 and missing600 remain independently reviewable in the old evidence.

Neither consumer generation has an audit event for1000. Today's source and target both omit it, while
the driver still retains its committed insert/delete and actual intermediate source image. The
successful table rebuild has not reconstructed that historical event.

### Why it matters

Appending a copy to stale data can preserve missed deletions or cause conflicts. Refreshing existing
membership is also not a replacement procedure. A bounded current-state rebuild can be correct while
an audit or billing consumer remains missing past effects; those requirements cannot be inferred
from a final row count or an advancing origin.

### How to apply

Choose the recovery obligation first: current projection, historical transitions or business effects.
For the first, establish source authority and a stable comparison/copy boundary, preserve disputed
state, actually replace/rebuild and verify subsequent work. For historical delivery, identify the
additional retained history or reconciliation needed; a snapshot alone is insufficient. This fixture
pauses its sole source writer during rebuild and does not claim concurrent multi-writer repair.
See [ALTER SUBSCRIPTION](https://www.postgresql.org/docs/16/sql-altersubscription.html).
