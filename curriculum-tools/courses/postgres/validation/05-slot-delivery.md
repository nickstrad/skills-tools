# Independent receiver effects and source acknowledgement acceptance

Primary acceptance, 2026-09-05. Current79 slot-position-and-acknowledgement is revision4. Each
complete script initializes separate owned PostgreSQL source/receiver processes and exercises actual
client-process losses. The variation adds a source crash before slot checkpoint persistence.

## Live evidence

Final core: /tmp/pg-slot-delivery-core.log, root /tmp/pg-owned-v5vw00j2. Final source variation:
/tmp/pg-slot-delivery-variation.log, root /tmp/pg-owned-3h5uxxie. Driver:
/tmp/pg-slot-delivery-validate.ts; scripts /tmp/pg-slot-delivery-{core,variation}.sh. Source and
receiver have different system identifiers, separate owned data/socket paths and independent SQL
transactions. Their identities and logs are retained at each root.

Unsafe trial: source IDs1,2 are committed and consumed with get. The receiver client applies them
inside an open transaction, then is killed at an observed idle-in-transaction boundary. Its backend
disappears. Receiver receipts remain empty and balance0, while source rows remain and the next slot
read is empty. The lost effects are explicitly inventoried and the unsafe slot is removed. The safe
trial uses a different table, namespace and newly created slot; it does not claim to reconcile this
deliberate failure.

Safe batch: one source transaction inserts IDs10–19 with equal deltas. A five-change request returns
12 events, including its complete BEGIN/COMMIT envelope. Two peeks match exactly and confirmation
stays0/8615D0. Its parsed COMMIT boundary is0/861B60. Killing an uncommitted receiver client leaves
zero receipts/credit and the complete batch available. A second client commits all ten receipts and
balance145, independently visible before it is killed. Source confirmation is still unchanged; fresh
replay and a new receiver call add0 effects. Receipt identity plus balance change share one
transaction. Reusing event10 with delta999 raises actual SQLSTATE22000/payload mismatch and leaves
all receipts and total unchanged.

Later source IDs20,21 commit at0/861C90. A source checkpoint saves the old slot state, then an
acknowledging client advances only to0/861B60. The returned boundary and actual confirmation agree.
After that client is killed, only20,21 remain pending and receiver total is still145. Thus the first
acknowledgement does not skip unprocessed later work.

In the variation, an immediate source stop occurs before another checkpoint persists the advanced
position. The separate receiver stays live with all ten receipts and total145. Source restart keeps
its system identity but recovers confirmation0/8615D0. The first twelve events actually replay,
exactly matching the original frame. Receiver retry adds0 and keeps145; acknowledgement through the
same COMMIT again preserves20,21. Their independent receiver commit adds2 receipts and41 credit,
followed by acknowledgement at0/861C90.

Final safe inventories match every ID10–21 and delta10–21; total186 equals the receipt sum. A normal
receiver restart preserves its system identity, all12 receipts and total186. Safe source stream is
empty. The unsafe receiver namespace still has no rows, with its missing source IDs1,2 separately
reported. Every owned psql client/server stops, and no source or receiver replication slots remain.

## Integration and limits

Exact current79 copied-catalog hint2:
/tmp/pg-slot-delivery-rendered-slot-position-and-acknowledgement.md. Output:
/tmp/pg-slot-delivery-exact-slot-position-and-acknowledgement.log; root /tmp/pg-owned-zgz334f0. It
repeats all process-loss boundaries, actual source slot rollback/replay, zero duplicate credit,
conflicting payload rejection, later-batch preservation and receiver restart.

Thirty tests/full formatting/lint/typecheck pass in /tmp/pg-slot-delivery-{tests,check}.log. Scoped
builder /tmp/pg-slot-delivery-scoped-build.py changes only current79 among93 lessons. Copied catalog
/tmp/pg-observe-progress-8uuhdb9n/progress.sqlite preserves IDs/progress/attempts; original first
seven, capacity and seven reading stops remain intact. Learner hash remains
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

This is controlled psql client-process loss with independent server observations, not packet-loss
injection. The parser accepts one fixed INSERT-only schema in test_decoding's non-streaming mode,
and the driver is the sole consumer. Event IDs and namespaces remain immutable, and all receipts are
retained through possible replay. Source acknowledgement and receiver effect are separate commits,
not a distributed transaction. Separate processes on one host do not establish independent host
failure domains. The source crash is deliberately placed in a verified checkpoint window; not every
crash necessarily moves confirmation backward. No automatic reconciliation of the unsafe trial,
arbitrary schema handling or receipt garbage-collection protocol is claimed.

Reusable findings: docs/knowledge/postgres-logical-evidence.md. Next: actual publication/bootstrap
with snapshot-plus-tail coverage under bounded INSERT/UPDATE/DELETE, then conflict reconciliation,
logical retention/resnapshot, durable protocols, incidents and final audit.
