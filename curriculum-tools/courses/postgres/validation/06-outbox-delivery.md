# Transactional outbox and independent receiver acceptance

Primary acceptance, 2026-09-05. Current83 transactional-outbox is revision4. The complete source and
exact learner variation initialize independently committed source/receiver PostgreSQL processes;
there is no printed PUBLISH substitute or shared receiver business transaction.

## Live boundaries and outcomes

Driver /tmp/pg-outbox-delivery-validate.ts runs /tmp/pg-outbox-delivery-{core,variation}.sh,
retaining /tmp/pg-outbox-delivery-{core,variation}.log. Core root /tmp/pg-owned-pr892aee; source
variation /tmp/pg-owned-sm9qi_x5. Distinct system identifiers/private sockets and independent
queries identify the endpoints. Root JSON and per-client/relay logs preserve exact transaction and
row evidence.

A real application client inserts order99 and its message inside an open transaction. Its backend is
idle in transaction with an XID; independent orders/outbox/relay claim all see nothing. Killing the
actual client, waiting for negative exit and backend disappearance leaves both rows absent. Two
successful source commits produce orders1/3 for amounts7/11 with matching immutable payloads. The
aborted identity allocation consumes1, so their actual returned message IDs are2/3.

A's claim transaction remains open while B skips its row, claims the other message and commits.
Captured tokens refer to distinct orders1/3. pgrowlocks returns1 while A is open and0 after it
commits; both messages remain claimed at generation1 with no source row locks held during receiver
work. Attempts count committed claims, not every delivery call.

B's receiver client inserts receipt3 and credits11 inside BEGIN, then pauses before COMMIT. The live
backend is idle in transaction with an XID. Independent receiver queries still show no receipts and
total0. Killing this client and verifying backend exit rolls back both. Source3 remains unsent.

A separate Python relay actually calls apply_order on the receiver for event2. Its subprocess query
commits receipt plus credit before writing its coordination marker. Independent receiver reads show
the full receipt and total7 while both source sent markers remain absent. Core kills the live relay
Python process before its acknowledgement call: exit-9, receiver7 retained, both source rows still
claimed. The after-ack variation first sends ACK, waits for the source query's successful commit
marker and independently verifies event2 is sent; only then does it kill the same relay process.

Controlled expiry makes remaining claims eligible without incrementing generation. Core recovery
claims2/3 at generation2; old-token acknowledgements affect0 rows. Retry2 applies0 and keeps7;
retry3 applies1 and reaches18. Valid new-generation acknowledgements each affect1. Variation leaves
already-sent2 at generation1 and reclaims only3 at generation2. In both paths, an extra duplicate
receiver call for2 adds0 and its duplicate/stale source acknowledgement affects0. Reusing that
identity with amount999 actually raises22023/receipt payload mismatch; receipts and total18 remain.

Final inventories join exactly two orders, two sent messages and two receiver receipts by immutable
payload, with total18 equal to both source amount sum and receipt sum. Failed99 remains absent;
leases are NULL and a fresh claim returns no work. Normal source and receiver restarts preserve
identities, all full table contents and total18, with the queue still empty. Both owned servers,
psql clients and the Python relay stop at cleanup.

## Exact learner commands and integration

/tmp/pg-outbox-delivery-exact.ts renders copied-catalog pgcoach83 hint2 into
/tmp/pg-outbox-delivery-rendered-transactional-outbox.md and executes its exact bash fence. Log
/tmp/pg-outbox-delivery-exact-transactional-outbox.log; root /tmp/pg-owned-3xhfkdc5. It repeats
actual application/receiver rollback, disjoint short claims, receiver7 before source ack, relay kill
after ack, only3's generation2 recovery, mismatch rejection and final total18 after both restarts.
All three final pairs have pg_ctl status3, no replication slots, no source errors and exactly the
expected receiver payload-mismatch error. Full code matches the executed source/variation scripts.

Scoped builder /tmp/pg-outbox-delivery-scoped-build.py changes only current83 among92 built lessons.
It includes the already-incorporated storage source needed to preserve the old artifact; that
unrelated source is not staged. New guides/14-patterns.ts is registered, and PLAN/prerequisites
match the complete experiment. Existing slugs/course revision2 remain; no identity is retired.
Copied /tmp/pg-observe-progress-6q168_z9/progress.sqlite preserves IDs, attempts, progress, the
original first seven, capacity semantics and seven reading stops. Learner SHA256 is unchanged:
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6. Thirty tests/full
format/lint/typecheck pass in /tmp/pg-outbox-delivery-{tests,check}.log.

These are controlled process losses on one host. No broker, network packet-loss fault, power-loss
restart or independent-host failure domain is claimed. The driver owns all writers, preserves
immutable identities/payloads and receiver receipts, and follows receiver-commit-before-source-ack.
Direct writers could violate that order. Claim generations protect source completion, not an
independent resource; deduplication protects the receiver credit. The deadline update represents
elapsed time and is not a measured expiry detector. Durable findings:
docs/knowledge/postgres-durable-protocol-evidence.md.

## Space preservation

Before these fixtures, /tmp/pg-outbox-archive-evidence.py cold-archived accepted conflict roots
_z7_bt4a/w80452ub/r5f69hzt and resnapshot roots joc4yatu/6eu11w08/ft13c_3t. Every original
PostgreSQL16 data/subscriber directory was stopped with status3/no PID and clean control state.
Reopened compressed archives matched exact regular-file path/SHA256 inventories; stopped state and
original hashes were rechecked before removing original data directories. Each root retains raw
logs/JSON, cold-archives.json, per-directory hash/control manifests and cold.tar.gz. Earlier reports
describe their original executions; these data images now reside in the archives. This is verified
cold-file preservation, not a tested restore. About257MB remains after the three outbox runs.
