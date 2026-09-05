# Staged incident evidence and receiver recovery

Preserve the incident-time window separately from later inspection, and require recovered consumer
state plus resource progress before accepting a disk-growth remedy.

## What happened

On2026-09-05, current88's staged fixture exercised a retained logical consumer, failed archive
destination and increased write demand using the same diagnostic interface. Preparation saves
workload/slot/archive/checkpoint/file samples and stops the private server. Inspection and recovery
restart only that owned server and stop it again. The initial symptom packet contains no selected
cause; full construction remains available to the tutor and learner on request.

Two implementation findings changed the acceptance criteria:

- A nontransactional pg_logical_emit_message used to wake the archiver also appeared in
  test_decoding output outside BEGIN/COMMIT. A parser expecting only ledger transactions rejected
  it. The archive wake now uses pg_create_restore_point followed by pg_switch_wal, outside measured
  workload intervals. It produces actual WAL without adding an application decoding message.
- Inspecting all areas through separate start/stop cycles generated additional WAL. The first
  receiver acknowledged only its last application COMMIT via pg_replication_slot_advance. Full
  application rows agreed and some old filenames disappeared, but the slot still retained newer
  checkpoint history with wal_status=extended. Those checks were insufficient proof of recovered
  resource progress. The revised receiver captures a flush-LSN bound, peeks through that bound,
  commits independent SQLite receipts/balance, then consumes through the same bound and compares
  every returned event. Empty consuming calls after checkpoints progress through non-application
  history too. Acceptance additionally requires reserved slot status and inspects WAL allocation.

PostgreSQL16 documents that the decoding functions' upto_lsn argument excludes transactions whose
commits are not before that position; peek leaves consumption unchanged. This supports using the
same bounded interval on both sides of the independent receiver commit. The fixture still owns all
application writers and is not a general decoding client.
[PostgreSQL16 replication management functions](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-REPLICATION)

## Why it matters

An inactive slot is also normal for this finite consumer between successful batches. Diagnose with
position movement and receiver progress, not activity alone. Directory allocation includes whole and
recycled files; actual workload WAL comes from the insertion interval. A controlled one-second
offered-work window differs from SQL execution duration and from elapsed inspection/archiving time.
Longer observed windows must remain visible rather than being silently normalized to one second.

Dropping and recreating a slot does not recreate its continuation point. The variation actually
decodes an empty new tail while the receiver lacks12,000 old operations, then replaces its
projection from a complete source snapshot with the driver writer stopped. Reconstruction is valid
here because the immutable source ledger retains all required operations. A snapshot of mutable
current state cannot universally reconstruct deleted events or independently committed historical
side effects.

Archive counters alone are insufficient: save the completed pending file inventory and hashes,
repair the actual destination failure and verify the archived bytes. This local handoff is not an
off-host backup, durable object-storage protocol or tested restore.

## How to apply

Keep saved before/during/after incident samples and fresh-after-restart samples distinctly labeled.
Give the learner exact inspection commands and alternative remedies without disclosing the selected
case. Record the chosen action before mutation, reject irrelevant actions without applying them, and
retain the failure logs. Do not accept successful preparation as completed recovery.

Check full receiver identities/payloads and derived business results, then deliver later work and
retry an empty batch. Check slot state, archive backlog and eligible old filenames alongside byte
allocation. Review the observations behind a PASS marker; a marker can reflect weak assertions. The
lesson's validation report records accepted run paths and superseded prototypes separately.

When preserving evidence for space, verify the owned cluster is stopped, hash every regular file,
reopen the cold archive and compare complete path/hash inventories. Recheck stopped state and the
original inventory before removing original data directories. Preserve logs, JSON and independent
receiver/decision stores; cold preservation is not evidence of a successful restore.

## Corruption and recovery-point evidence (2026-09-05)

The replacement corruption incident preserves a structurally valid page header and flips exactly one
known payload byte while its server is stopped. An actual heap-reading aggregate returns
SQLSTATEXX001 with page verification failure; an offline pg_checksums scan independently reports one
bad checksum. Reconstructing the full relation from the retained original page produces the
pre-damage SHA256, verifying the scope beyond a printed one-byte claim. Do not teach that every
invalid-page error requires checksums: structural damage can be detected without them too.

A cold filesystem backup must copy the complete cleanly stopped cluster, including WAL and
transaction status. A table-file copy is not equivalent. The fixture records full file hashes,
checks the stopped backup, restores into another owned directory, then compares every domain row.
File agreement and clean page checks alone cannot establish application completeness.
[PostgreSQL16 filesystem backups](https://www.postgresql.org/docs/16/backup-file.html),
[pg_checksums](https://www.postgresql.org/docs/16/app-pgchecksums.html).

The core backs up500 operations before ten later commits; the variation moves the same backup
boundary after those commits. Without later WAL replay, the core explicitly reports missing accepted
IDs501–510, while the variation restores all510. Both then commit new ID511 and verify complete
payloads and derived amounts. Using511 avoids silently reusing an accepted identity absent from the
restored core. Saved accepted inventory is diagnosis evidence, not an implicit replay log.

Preserve the damaged source file and original backup unchanged while verifying the new destination.
The fixture's copy timer measures verified copying separately from startup/full inventory checks;
neither is production RTO or diagnosis time. Actual paths, checksum values and affected row IDs
within the selected page are observations, not portable constants.

The staged controller keeps all servers stopped between preparation, inspection and explicit
recovery. Its nonblocking file lock rejects overlapping phases. Its cleanup action checks every
owned cluster stopped before removing only that fixture. For author acceptance, verify/compress the
required image first, then execute this actual supplied cleanup command; this tests the lifecycle
that learners receive and prevents another accumulation of raw experiment directories.

## Completed scans versus freeze eligibility (2026-09-05)

The new freeze incident keeps100 baseline tuples frozen, prepares a small effect in a different
table, then commits100 newer ledger tuples. Three explicit FREEZE/DISABLE_PAGE_SKIPPING passes
complete, including one after restart, but only the baseline identities are frozen. No other client
backend or replication slot is present. The prepared XID matches the ledger's pinned relfrozenxid in
this fresh fixture. The separate table's unresolved transaction horizon matters; repeating a
completed scan or looking only for idle client sessions misses that dependency.

Decode combined tuple flags through heap_tuple_infomask_flags rather than treating a raw xmin number
as proof of freezing. HEAP_XMIN_FROZEN combines underlying flag bits. Join physical entries back to
current ctid while the fixture owns all writers, and retain every identity's flag evidence. The
visibility-map all-frozen bits and relation boundary are additional observations, not
interchangeable counters.
[PostgreSQL16 pageinspect](https://www.postgresql.org/docs/16/pageinspect.html).

Resolution follows the independently committed coordinator decision, never a guessed rollback to
improve a metric. ABORT leaves no effect; COMMIT leaves exactly(1,41). Both release the prepared
entry, permit all200 tuples to freeze, advance the boundary and preserve the same complete ledger
through restart. This is a distinct bounded diagnosis built from the prior freezing/2PC lessons; it
does not burn150,000 XIDs, lower thresholds, start an anti-wraparound worker or model a deadline.

Prepared transaction state has no ordinary live client PID to terminate after detachment, and it
survives restart. pg_prepared_xacts and the known decision store supply complementary evidence: one
identifies the outstanding participant, the other authorizes its result. The business effect must
still be checked after the GID disappears.
[PostgreSQL16 pg_prepared_xacts](https://www.postgresql.org/docs/16/view-pg-prepared-xacts.html).

## Bounded request intervention and observation lifetimes (2026-09-05)

A real incident survey can finish before a learner inspects it. Capture a bounded live interval,
record exact actor identities and actual pending-response evidence, then explicitly clean up the
survey actors. Apply the learner's chosen policy to an equivalent fresh trial with new identities.
Label those boundaries: this evaluates a policy; it does not imply that a later command affected the
historical request. It prevents idle readers from leaving CPU work, blocked clients and locks alive.

The new request incident measures Linux backend CPU tick deltas separately from pg_stat_activity. An
active state and a null wait event do not independently establish CPU consumption. A waiting request
can be blocked by an idle holder while a third computation consumes CPU without causing that lock
dependency. Join blocking PIDs, exact application identities, row-lock owners and committed data
before choosing the intervention.
[PostgreSQL16 activity states/waits](https://www.postgresql.org/docs/16/monitoring-stats.html).

A true pg_cancel_backend result acknowledges signal dispatch. The zero-timeout/default form of
pg_terminate_backend also does not wait for termination. Check the client SQLSTATE, exact backend
presence, transaction usability and actual data independently. This fixture observes
cancellation57014, explicit-transaction25P02 until rollback, and termination57P01/backend absence.
Cancelling the idle holder leaves its transaction and row lock intact here. Cancelling a failed
explicit request does not imply its previous row locks remain held; inspect ownership rather than
extending the state label into an unsupported resource claim.
[PostgreSQL16 administrative signals](https://www.postgresql.org/docs/16/functions-admin.html).

Changing only the request's prior-write boundary to autocommit preserves that earlier committed note
through either cancellation or termination. The equivalent explicit transaction loses it. Record
full identities/payloads and the before/after commit boundary, not just row counts. Keep the chosen
request's response timer separate from later diagnostic comparisons and cleanup.

A psql client can exit0 after quit without reading a termination message already waiting on an idle
connection. Conversely, an intentionally terminated active client can correctly exit2. Classify
client exits and server error lines at their operation boundaries; neither exit0 nor a true signal
result alone proves backend disappearance. Successful trials here had no forced client kills and
independently verified all clients exited and the owned postmaster stopped.

Execute the supplied cleanup action after preserving only required audit evidence. The91 bootstrap
also removes its own temporary script/location files once it has the persistent controller path.
Full archive/file-hash agreement must precede raw database removal, and retained bulky images still
have the final whole-course audit as their removal trigger. Stopping a process remains only one part
of cleanup.
