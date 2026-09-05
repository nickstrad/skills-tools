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
