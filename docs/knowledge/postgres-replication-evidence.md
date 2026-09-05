# PostgreSQL replication evidence

Use owned topologies and complete application outcomes to distinguish transport, replay and authority.
Updated 2026-09-05.

## What happened

The first physical replication replacement creates a new source and a verified pg_basebackup -R
copy with a dedicated LOGIN REPLICATION role and persistent physical slot. Distinct private
sockets, matching system identity, actual sender/receiver endpoints, recovery roles and full
post-backup receipt contents pass. A real standby write fails SQLSTATE25006 without adding data.

The receiver variation initially tried pg_terminate_backend, which returned false for this
auxiliary process on PostgreSQL16. The accepted driver sends SIGTERM only to the PID obtained
from pg_stat_wal_receiver on the owned standby. It proves a replacement streaming PID, new log
line, a later replay boundary and complete receipt equality. This does not require a particular
stale-read interval during a potentially fast reconnect.

## Why it matters

A physical copy's system identifier does not establish freshness or writer ownership. A transport
status does not prove a specific commit has replayed. A successful receiver restart does not prove
failover. Each conclusion needs its own observed boundary; read-only rejection must be an actual
SQLSTATE result rather than an unrelated connection failure.

Post-backup configuration edits must follow pg_verifybackup; otherwise the verifier can report
those intentional edits instead of testing the original copy. Preserve pg_basebackup -R's source
primary_conninfo while overriding only the standby socket/name/settings. The receiver feedback
interval is expressed in seconds; use1s rather than a subsecond value that can round to disabled.

## How to apply

Use owned-replication.ts without changing the existing owned-cluster helper embedded in accepted
lessons. Poll streaming state and replay positions, then inspect complete domain values with a new
query. Capture receiver PID from the known owned server before a targeted signal. Keep raw logs and
classify expected25006 and receiver termination separately from unexpected failures.

Stop the standby, poll its physical slot inactive, drop only that slot and stop the source. Do not
leave a cross-lesson shared topology or hidden consumer-retention promise. Lifecycle/failure trials
remain serial. See validation/05-standby.md for source and exact rendered-variation paths.

References: PostgreSQL16 [standby operation and streaming](https://www.postgresql.org/docs/16/warm-standby.html)
and [hot standby](https://www.postgresql.org/docs/16/hot-standby.html). Runtime observations above
come from the repository's actual experiments rather than those documents.

## Paused replay, durable receive and feedback (2026-09-05)

### What happened

The driver waits for pg_get_wal_replay_pause_state='paused', saves replay LSN, then commits
2,000/4,000 receipts. Receiver flushed_lsn and source pg_stat_replication.flush_lsn separately
reach the post-COMMIT bound, while replay remains fixed and a fresh standby query returns only
the original row. Resuming actual replay and checking complete values produces2,001/4,001
correct rows, with zero missing/extra IDs and expected sums.

### Why it matters

A pause request is not yet a paused process. Local receiver flush and the source's receipt of
that acknowledgement are also separate observed boundaries. Neither establishes visibility
before replay. After catch-up, source replay_lag can remain a positive recent acknowledgement
sample even when direct standby receive/replay positions match. Initial transaction replay
timestamps can be NULL after bootstrap; preserving NULL is preferable to inventing a time origin.

### How to apply

Wait for actual paused state, require a fixed replay position while receive/flush advances, and
prove stale rows independently. Gate resumed reads on the intended committed bound within one
known history, then check every application value under a fresh query. Preserve time-lag fields
as asynchronous observations rather than asserting that they become zero. Bounded workload and
finally cleanup prevent a paused consumer from leaving an unbounded retention obligation.
Source and exact CLI evidence: validation/05-replay-lag.md.

## Bounded same-history read-your-writes (2026-09-05)

### What happened

A profile update and independently keyed request receipt commit atomically while actual physical
replay is paused. A separate post-COMMIT pg_current_wal_insert_lsn call supplies the bound. Receiver
flush passes it, but the replica retains version1/before and no receipt. A500ms gate returns timeout
with no payload and zero domain queries. Three negative tokens change system identifier, timeline
or pinned topology epoch while preserving the numeric bound; each rejects before any LSN comparison.
After resume, exactly one fresh application query returns version2/after and request-42.

The variation changes only timeout policy: an explicitly separate pinned-primary read returns those
values while standby remains paused and stale, then the resumed replica produces the same result.
Core/source/exact CLI runs pass; validation/05-replica-readiness.md records observations and paths.

### Why it matters

A bound sampled after COMMIT contains the write in this history even though it is not the exact
transaction record. Gate admission precedes the domain statement snapshot. Ordinary helper SQL has
its own timeout, so a short end-to-end read deadline must instead pass its remaining budget to
every subprocess and statement, including the data query. Late results are discarded. Process
termination/scheduling adds overhead; observed500ms attempts were slightly longer than500ms.

System identity, timeline and a driver-owned topology epoch are explicitly pinned for this fixed
fixture. Control-file or receiver metadata does not implement fencing or establish current writer
authority after failover. Synthetic mismatched tokens test the rejection branch; they do not prove
a divergent-history failover. Fallback also needs its own budget and cannot reuse an expired one.

### How to apply

Keep trusted token/history validation ahead of numeric comparison and application access. Treat
unknown history, query errors and deadline expiry as responses without application data. Query
under a new snapshot after successful apply admission, verifying receipt key and domain values
together. Revalidate topology/authority across failover using the actual authority service; do not
infer ownership from a system ID or increasing timeline. This bounded lab deliberately has no
concurrent writer changes or receipt deletion, so its exact expected payload is stable.

References: PostgreSQL16 [recovery control and position functions](https://www.postgresql.org/docs/16/functions-admin.html)
and [statement snapshots](https://www.postgresql.org/docs/16/transaction-iso.html). Runtime values
above are from the executed local experiment.

## Synchronous acknowledgement, local durability and visibility (2026-09-05)

### What happened

An actual owned standby is selected by FIRST1 and sync_state=sync. During verified paused replay,
local and on commits complete. The remote_apply transaction waits in IPC/SyncRep even after its
COMMIT record reaches standby durable receive. The driver matches the waiting backend_xid against
pg_walinspect's Transaction/COMMIT record and checks its end_lsn below primary flush. An independent
primary query still excludes the waiting receipt. Resuming replay yields normal acknowledgement
and fresh primary/standby agreement.

After actual standby shutdown, a local commit completes while an on commit waits with no sender.
Again its matching COMMIT record is locally flushed, but its row is invisible to the independent
primary snapshot. pg_cancel_backend cancels the acknowledgement wait: psql prints COMMIT, exits0
and emits WARNING/01000 stating that local commit occurred without ensuring replication. A fresh
primary query now sees the receipt while standby is still stopped. Reconnection later replays all
five exact receipts. The variation reconnects instead of canceling; the normal acknowledgement has
no warning. Core/source/exact CLI paths are in validation/05-sync-acknowledgement.md.

### Why it matters

The old lesson's inserted timestamp did not establish commit durability. A durable COMMIT record
and primary visibility are separate boundaries: synchronous waiting precedes final transaction
cleanup, so another primary snapshot can still exclude the row. Treating that temporary absence
as rollback evidence could induce an unsafe retry. Canceling this wait cannot reverse local commit,
and exit0/COMMIT alone does not establish the originally requested remote guarantee when a warning
says otherwise. This particular run receives a local-commit warning; lost-response uncertainty is
an application consequence to reason about, not a failure boundary claimed as executed here.

### How to apply

Observe SyncRep for the specific owned client and match its XID to the actual WAL record. Preserve
source flush, independent domain visibility, receiver/replay positions and complete client output.
Reconcile the stable request receipt after the wait completes. Give observer/cleanup connections
explicit local acknowledgement and writers SET LOCAL policy; this avoids cleanup depending on the
missing receiver. The synchronous name stays configured while offline so reconnection fulfills the
same original requirement. Client durations include startup, diagnostics and deliberate waits;
these single observations are not a production latency or failure-domain benchmark.

References: PostgreSQL16 [commit policies](https://www.postgresql.org/docs/16/runtime-config-wal.html#GUC-SYNCHRONOUS-COMMIT),
[synchronous replication](https://www.postgresql.org/docs/16/warm-standby.html#SYNCHRONOUS-REPLICATION)
and [REL_16_STABLE cancellation handling](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/replication/syncrep.c).
The local durability/visibility separation and warning handling above were also executed directly.

## Recovery conflict versus slot-owned feedback horizon (2026-09-05)

### What happened

Two fresh10,000-row tables isolate feedback off/on. Off: actual active PgSleep reader with a
repeatable-read snapshot fails with40001 and removed-row-version detail after DELETE/VACUUM;
confl_snapshot increases by one and other captured conflict counters stay unchanged. Primary
physical inspection reports5,000 surviving/zero dead versions; fresh standby agrees after replay.

On: the reader's xmin is737. The primary sender's backend_xmin stays NULL, but the owned active
physical slot's xmin becomes737. Waiting for sender backend_xmin alone failed three prototypes;
the slot is the actual holder in this topology. After observing a protecting slot horizon, delete
and vacuum retain5,000 dead versions while both fresh nodes see5,000 survivors. The same old
reader returns all10,000 rows again and commits normally; no additional conflict occurs.

Reader release plus feedback-off acknowledgement clears slot xmin. Another VACUUM changes dead
versions5,000→0 and free bytes12,372→693,064 while table bytes remain1,417,216 (TRUNCATE false).
Quarter-deletion variation retains2,500 dead versions, then recovers free bytes12,372→352,720;
7,500 survivors/sum37,500,000 versus core5,000/sum25,000,000. Cardinality, distinctness, valid-ID
range, zero remaining deletion candidates and every payload jointly prove exact result membership.

### Why it matters

In PostgreSQL16, ProcessStandbyHSFeedbackMessage uses PhysicalReplicationSlotNewXmin when a
physical slot is attached, clearing the sender process xmin and storing the horizon in the slot.
Without a slot it uses the sender process. NULL pg_stat_replication.backend_xmin therefore does
not establish that feedback is inactive. Query the retention owner used by the actual topology.
The design05 wording now records this evidence-backed correction without dropping the required
observed horizon, reader survival, retained-version or eventual reclamation behavior.

An earlier bootstrap gate at idle pg_current_wal_insert_lsn0/F00028 timed out immediately after
backup. No reader or mutation was active yet. Replacing that insertion-location gate with an
explicit pg_create_restore_point record end makes replay readiness concrete; each later vacuum
boundary uses the same marker technique. Insertion space can be ahead of the last replayable
record. Review idle boundary assumptions during the final integration audit; this finding does
not invalidate an already observed post-COMMIT receipt result, but a generic gate should avoid
assuming that every next-insertion location is an existing record end.

### How to apply

Observe the actual reader xmin and primary slot horizon before deletion. Compare XID ages within
one primary query, not raw numerical XID ordering. Preserve sender NULL and slot xmin together.
Use VACUUM VERBOSE and pgstattuple alongside independent old/new snapshot results; reader survival
alone is insufficient. Disable file truncation to isolate snapshot conflicts from lock conflicts,
and distinguish reusable space from file shrinking. The1s replay-delay setting is an accumulated
apply-delay limit, not an exact one-second query timeout. Finish the old transaction, observe
horizon release and verify actual reclamation. A fresh retry restarts the whole canceled read
transaction. Source/exact CLI evidence: validation/05-standby-conflicts.md.

References: PostgreSQL16 [feedback/delay settings](https://www.postgresql.org/docs/16/runtime-config-replication.html),
[physical tuple inspection](https://www.postgresql.org/docs/16/pgstattuple.html) and
[slot versus sender horizon handling](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/replication/walsender.c).
Runtime values above come from the actual owned experiments.

## Disconnected consumer retention and lost-history rebuild (2026-09-05)

### What happened

The owned physical consumer consumes a baseline marker/receipt and then stops. Its slot remains
inactive at0/A00090. Sixteen2,000-row commits produce32,001 total receipts; checkpoints with an8MB
max_wal_size and unlimited slot retention leave35 one-MB segment files (36,700,160 bytes), including
anchor00000001000000000000000A. wal_status is extended. The slot position stays fixed, establishing
retention by this actual disconnected consumer rather than an unused demonstration slot.

Core reconnection replays all receipts and advances the slot. After a later streamed ID32,001,
complete source/standby results agree on32,002 distinct IDs0–32,001/sum512,048,001 with every payload
correct. Final checkpoints remove the anchor filename and leave8 one-MB files (8,388,608 bytes);
slot is active/reserved. Directory bytes and restart distance differ because of segment allocation,
recycling and extra WAL. Later inspection/checkpoints can generate additional hint/page/WAL work;
these are retention samples, not an exact receipt byte charge.

Variation caps the already oversized inactive slot at4MB and checkpoints. It becomes lost with
NULL restart_lsn/safe_wal_size; the needed anchor segment disappears and the source logs invalidation.
Actually restarting the old standby returns pg_ctl success, but its receiver reports the requested
segment has already been removed. A fresh query still sees only ID0 and replay remains behind the
work marker. Thus successful postmaster startup is demonstrably insufficient for data readiness.

The driver stops and renames the failed data/logs, drops only its lost slot/dedicated role, restores
unlimited retention for rebuilding and runs a new complete basebackup/manifest verification. That
new copy returns all32,001 existing receipts and then streams the post-backup ID32,001. All clients,
servers and owned slots are cleaned up. Source and exact CLI reports: validation/05-slot-retention.md.

### Why it matters

A slot's retention promise outlives its connection. max_wal_size is a soft recycling/checkpoint
target, while max_slot_wal_keep_size lets checkpoint processing revoke an excessive obligation.
Neither setting is a strict whole-directory byte ceiling. safe_wal_size=NULL must be interpreted
with status and configuration: unlimited retention and already-lost history are different states.
Recreating a slot alone cannot restore the consumer's missing history. The fixture has no alternate
archive; it executes a full rebuild and verifies later live delivery before declaring readiness.

### How to apply

Save the restart anchor and actual segment inventory before workload, then compare status, files
and complete domain contents at the relevant boundaries. Treat failed receiver logs separately from
postmaster startup status. Preserve the old copy before reinitializing, verify the replacement backup
before configuration edits and commit a new receipt afterward to prove streaming. Use bounded
workload and cleanup rather than implying an unlimited retained-WAL promise is safe to abandon.

References: PostgreSQL16 [slot view](https://www.postgresql.org/docs/16/view-pg-replication-slots.html),
[retention settings](https://www.postgresql.org/docs/16/runtime-config-replication.html) and
[WAL configuration](https://www.postgresql.org/docs/16/runtime-config-wal.html). Numbers above come
from executed local trials, not forecasts for another workload.

## Promotion, receipt inventories and controlled writer exclusion (2026-09-05)

### What happened

Each full experiment runs two independent owned topologies. In the unsafe case, clearing the
standby's primary_conninfo and observing both receiver/sender disappear prevents transport of the
next acknowledged source receipt. Promotion then creates timeline2 without affecting timeline1's
writer. Both still accept application inserts: old inventory is IDs0,1,2; new inventory is IDs0,3.
Choosing new alone omits acknowledged IDs1,2; choosing old alone omits ID3. Both independent sets,
client acknowledgements, system identity and timeline history are retained before shutdown.

The controlled case creates a fresh pair. After source receipt1 acknowledges, the driver closes
admission, changes the old application's role to NOLOGIN and verifies zero existing app sessions.
A direct old-source insert attempt fails at login. The candidate must match known history, replay
the closed-writer marker and contain all acknowledged source receipts. The owned consumed slot is
released before old-source shutdown so cleanup never needs to restart that fenced writer. A direct
old-endpoint insert fails connecting after verified shutdown, before promotion occurs.

After promotion, the driver advances its routing epoch, enables login only on the new node and
opens admission. The old token rejects with zero database attempts; the new token acknowledges
receipt2, and the full new inventory equals every successful acknowledgement. Old source remains
stopped. The variation pauses actual replay before receipt1: candidate initially has only ID0 at
0/A00090, below the0/A00B50 marker, and is refused. Resume/catch-up precedes the same exclusion and
cutover gates. Source/exact CLI evidence: validation/05-failover-workload.md.

### Why it matters

Promotion can replay already-received WAL, so pausing apply alone would not reliably demonstrate
an acknowledged write missing from the promoted history. Stop the actual transport before that
write when missing-history evidence is required. Timeline2 with the same system identifier records
ancestry, not writer ownership; the old authority remains usable until separately excluded.

NOLOGIN does not remove existing application sessions, so the zero-session check is part of this
fixture's quiescence evidence. Process shutdown and rejected endpoint access supply actual local
writer exclusion. The in-memory epoch is only a driver-owned admission policy: no distributed
lease, election, durable authority service or protection from an uncontrolled privileged restarter
has been implemented. The controlled experiment has a reachable writer and cannot establish
zero-loss failover from an unreachable asynchronous primary.

### How to apply

Record client acknowledgements separately from each branch's contents. Keep the unsafe history
available before any rewind or rebuild erases it. For a controlled transition, stop admission,
exclude old clients, inventory acknowledged work, verify candidate history/replay/data, then stop
the old writer before promotion and open only the new route. Rejected login, endpoint and stale
routing probes should never appear as accepted receipts. Keep stronger failure-domain and
external-fencing claims outside what a disposable same-host driver actually proves.

Reference: PostgreSQL16 [failover and old-primary exclusion](https://www.postgresql.org/docs/16/warm-standby-failover.html).
The receipt sets and rejection observations above are measured local results.

## Rewind preserves a chosen history, not every acknowledgement (2026-09-05)

### What happened

The owned experiment acknowledges old-branch ID1 (IDs1–3 in the variation) and chosen-branch ID100
on physically related divergent timelines. Before target rewrite it saves both complete independent
receipt sets and all client acknowledgements, fences/stops the old writer, and creates a compressed
cold target archive. Reopening and hashing every regular archive member verifies the exact982-file
map against the stopped target. This preserves physical evidence without claiming an independently
tested restore. Checksums were enabled at initialization, full_page_writes remains on, and32MB
wal_keep_size retains target history through the bounded divergence.

Both pg_rewind dry run and actual run print divergence0/A00090, common checkpoint0/900060,6MB copy
work and Done. A complete before/after target hash comparison proves the dry run did not change
regular-file contents. Actual -R creates standby.signal. Source configuration is copied too;
explicit target socket, dedicated replication user, new owned slot and timeline2 must override it
before startup. The new slot is created on the source, since source replication slots are not copied
as ordinary target state.

The target rejoins in recovery and streams received_tli2 even while its checkpoint timeline still
reports1. It contains chosen IDs0,100, rejects an app INSERT with25006/read-only, then receives new
source receipt200 behind a real replay marker. Final complete sets match IDs0,100,200. Old-only
acknowledgements remain separately inventoried and physically archived; they are absent from the
chosen live history. All owned servers stop and slots drop. Source/exact CLI evidence:
validation/05-rewind-workload.md.

### Why it matters

Progress text and successful tool exit do not prove target mutation or operational recovery. The
subsequent receiver, read-only probe, replay marker and full domain inventory establish different
parts of that claim. Copied catalogs also restore source role state: old-target NOLOGIN may become
LOGIN, making actual recovery-mode write rejection necessary. Checkpoint history can lag active
streaming history; do not diagnose a failed rewind from that field alone.

### How to apply

Choose authority explicitly, preserve both application and physical evidence before rewrite, and
classify discarded acknowledgements. Fence the target and verify historical prerequisites before
running the tool. Inspect copied settings and repair endpoint/receiver identity before startup; then
verify the actual selected history, domain contents and a later streamed effect. Stop the rejoined
target before removing its source slot during cleanup, accounting for the swapped roles. Do not
claim that rewind merges business outcomes or guarantees a particular speedup.

Reference: PostgreSQL16 [pg_rewind](https://www.postgresql.org/docs/16/app-pgrewind.html).
