# Prepared participants and durable coordinator recovery acceptance

Primary acceptance, 2026-09-05. Current85 two-phase-commit is revision4. The private two-participant
fixture retains real prepared locks, cleanup horizons and participant crash recovery, then adds a
separately persisted coordinator decision and actual coordinator loss. It replaces the earlier
single-database transfer with independently committed PostgreSQL participants and complete outcome
receipts. No shared lab or port5440 operations occur.

## Participant promises and internals

/tmp/pg-two-phase-protocol-validate.ts executes source core and variation; scripts/logs are
/tmp/pg-two-phase-protocol-{core,variation}.{sh,log}. Core root /tmp/pg-owned-aky4t1rw; source
variation /tmp/pg-owned-41p4bhj6. Both PostgreSQL16.15 participants have distinct system
identifiers, private Unix sockets, max_prepared_transactions4,
fsync/synchronous_commit/full_page_writes on and owned data directories. A separate SQLite3.53.4 log
uses DELETE journaling and synchronous FULL, read back as2 by every coordinator connection.

The coordinator first commits operation transfer-1, full payload (sourceA/destinationB/amount25),
GIDs transfer-1:A/B and immutable expected participant descriptors into SQLite. Then separate psql
calls update A by-25 and B by+25, insert full COMMIT outcome receipts and PREPARE TRANSACTION. Those
SQL clients exit. Independent pg_stat_activity confirms no other client remains; both balances are
still100 and outcome tables empty, while each pg_prepared_xacts row records its GID, XID, prepared
time, owner and database. SQLite's committed decision is still null.

A real competing account UPDATE blocks on A's prepared XID. The evidence joins the waiter's
Lock/transactionid wait and ungranted ShareLock to the prepared transaction's granted ExclusiveLock
with null PID; pg_blocking_pids contains0 for that detached blocker. Its local1500ms lock timeout
actually raises55P03 and exits1 without changing account/outcome/prepared state.

Deleting250 of A's500 unrelated junk rows commits while the older prepared XID remains. VACUUM
VERBOSE reports250 dead but not yet removable; pgstattuple reports250 live/250 dead. Actual pg_ctl
immediate stop crashes A, and its log records automatic WAL recovery and recovery of prepared state.
Complete participant inventories after restart equal the pre-crash inventory, including
GID/XID/prepared timestamp. A second real blocked writer fails55P03; vacuum still retains250 dead.
This is measured reclamation retention, not a claim that all vacuum operations everywhere stop.

## Core: recover the committed decision through partial finalization

The real Python coordinator commits COMMIT into SQLite before issuing COMMIT PREPARED to A. It
verifies A's full outcome, then pauses before finalizing B. Independent SQLite/participant reads
show durable COMMIT, A75 with matching outcome and no prepared GID, and B100 with a prepared GID and
no visible outcome. SIGKILL kills that actual coordinator with exit-9; fresh independent reads prove
the same state survives. B's real competing writer still blocks on its prepared XID and fails55P03.
The temporary visible sum175 demonstrates separate participant finalization; the experiment does not
claim a global cross-database read snapshot.

A new coordinator recovery process reads the durable COMMIT decision and pauses before resolution.
The parent verifies the committed decision and unchanged partial participant state independently.
Only then does recovery proceed. Its recorded actions are verify_committed_receipt for A and
commit_prepared for B. It requires A's complete
operation/GID/participant/payload/decision/delta/result receipt, rather than accepting missing
prepared state alone. Final A75/B125 totals200, and matching receipts carry deltas-25/+25 and
results75/125. Recovery does not issue a second debit or credit.

## Variation: a locally written decision is still uncommitted

The only changed condition is the coordinator-loss boundary. After the same two prepared
participants, actual A crash, blocking and cleanup observations, the coordinator starts a SQLite
write transaction and UPDATEs decision to COMMIT but does not commit. Its own connection reads
COMMIT and reports an open transaction; the parent's independent connection still reads null. Both
participant balances remain100, outcome tables empty and prepared GIDs present. SIGKILL loses that
actual coordinator; a new SQLite connection still reads null and both promises remain intact.

A new recovery process applies the explicit policy for this registered operation and known-dead
coordinator: commit ABORT to SQLite before resolving either participant. The parent independently
verifies durable ABORT while both participants are still prepared. Recovery then rolls back each GID
and inserts matching zero-delta ABORT outcome receipts in subsequent local transactions.
Final100/100 totals200 with no transfer effect. Reentry after rollback can record or verify ABORT
because the immutable decision, participant registry and controlled-writer ordering remain known;
this is not a heuristic choice made solely from missing prepared state.

## Final evidence, repeat recovery and exact commands

Both outcomes release all prepared and waiting locks, and fresh account updates acquire the formerly
blocked rows before rolling back. The next VACUUM removes250 dead tuples, leaving250 live/0 dead.
Another independent recovery process changes nothing. Normal restarts of both servers preserve their
system identifiers, full account/outcome state and SQLite decision; a further fresh recovery process
again changes nothing. Final pg_prepared_xacts arrays are empty and integrity_check on SQLite
returns ok. Four coordinator processes exit-9/0/0/0, three probes exit1 with expected55P03, and both
owned PostgreSQL servers stop.

/tmp/pg-two-phase-protocol-exact.ts renders copied-catalog pgcoach85 hint2 from
/tmp/pg-observe-progress-_a5pygou/progress.sqlite into
/tmp/pg-two-phase-protocol-rendered-two-phase-commit.md and executes its exact shell fence. Log:
/tmp/pg-two-phase-protocol-exact-two-phase-commit.log; root /tmp/pg-owned-b8q_7tgt. It reproduces
the complete before-decision-loss/ABORT variation, including actual participant crash, three blocked
writers,250 retained then reclaimed rows, independent decision-before-resolution evidence and
unchanged repeat/restart recovery.

/tmp/pg-two-phase-protocol-audit.py independently verifies all three runs' configuration, complete
payloads/outcomes/balances, decision ordering, actual wait/lock relationships, pre/post-crash
prepared identity, cleanup counts, SQLite file contents and stopped server status. Each A log has
exactly two lock-timeout errors; each B log has exactly one, with no unexpected FATAL/PANIC. All six
servers report pg_ctl status3/no PID. Built core matches the executed script modulo the builder's
final newline trim; exact rendered hint matches the executed source variation. Retained JSON,
coordinator program/spec, SQLite decision file, raw coordinator/probe/vacuum logs and PostgreSQL
data directories make the evidence inspectable.

Scoped /tmp/pg-two-phase-protocol-scoped-build.py builds92 lessons in
/tmp/pg-two-phase-protocol-build-vrg_on7a and changes only current85's generated object. It includes
the already-incorporated unrelated storage source only to preserve existing generated content; that
source is not staged. Stable slug/course revision2, original first-seven objects and current
completions, capacity semantics, seven reading stops and all copied IDs/history/progress survive.
Learner progress SHA256 remains 395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.
Thirty tests/full format/lint/typecheck pass in /tmp/pg-two-phase-protocol-{tests,check}.log. A
wording correction to the previous idempotency report now names its already-verified final-newline
normalization explicitly; no accepted idempotency commands or generated lesson content changed.

## Scope and preserved storage

The coordinator is known dead before recovery takes over. The fixture has one registered operation,
a known participant set, controlled writers, retained identity/decision/outcome records and no
concurrent competing coordinator. It does not implement consensus, election, cross-database snapshot
isolation, network partitions, heuristic resolution, or independent-host failure domains. A's crash
is actual PostgreSQL immediate-stop recovery; SQLite and later normal server restarts do not test
host power loss or storage hardware durability. FULL is explicitly set, rather than inferred from a
library default. Direct database/decision-log writers could bypass protocol ordering. These limits
remain explicit in the lesson and guide.

Before these pairs, /tmp/pg-twopc-archive-evidence.py cold-archived only the accepted current83
outbox roots pr892aee/sm9qi_x5/3xhfkdc5, directories data/receiver. Each was independently stopped,
PostgreSQL16 and in clean control state. Reopened tar.gz regular-file path/SHA256 inventories
matched originals, and stopped state/original hashes were rechecked before removing original data
directories. Every root retains cold.tar.gz, cold hash/control manifests, cold-archives.json and all
original raw logs/JSON. This is verified cold-file preservation, not a tested restore. Current84
and85 data directories remain intact; about113MB remains after the exact85 run. Durable findings:
docs/knowledge/postgres-durable-protocol-evidence.md.
