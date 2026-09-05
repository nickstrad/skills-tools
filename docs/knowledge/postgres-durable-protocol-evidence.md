# PostgreSQL durable protocol evidence

Use actual independently committed effects, process-loss boundaries and complete domain inventories
when teaching outbox, idempotency, prepared decisions, fencing and notification recovery. These
findings build on the logical-delivery notes without changing those accepted experiments.

## Source atomicity does not include the receiver's commit (2026-09-05)

### What happened

Current83 holds order99 and its outbox row uncommitted in an actual application psql process.
Independent order/outbox reads and a relay claim see neither. Killing that client and waiting for its
backend to disappear leaves both absent. Successful source transactions then create orders1/3 for
amounts7/11 with exactly matching event payloads. The aborted identity allocation leaves the committed
message IDs2/3; message identity is captured rather than inferred from row count.

The separate receiver function commits an immutable namespaced receipt and credits its balance in
one transaction. Killing an uncommitted receiver client after both changes have executed leaves no
receipt or credit. A separate Python relay then actually calls the receiver, waits for successful
commit and pauses before calling source acknowledgement. Independent reads prove receipt2 and total7
while source2 remains claimed/unsent. Killing that live relay process preserves the receiver7.
Recovery replays the same event, adds0 credit and then commits the source sent marker.

### Why it matters

The previous SELECT PUBLISH and ROLLBACK demonstration never exercised an external effect. A printed
message cannot establish receiver commit, and inbox row counts alone do not prove atomicity with a
business mutation. Source business/event commit, receiver receipt/effect commit and source sent-marker
commit are three distinct boundaries. A direct source writer could mark sent without a remote
commit; correct ordering is an explicit responsibility of this controlled relay protocol.

### How to apply

Use a separate receiver with a measurable effect and independent queries. A marker may coordinate
failure injection, but verify the actual database state before killing the owned process. Require
receipt and effect to roll back together before COMMIT and survive independently afterward. Retain
payload agreement and the identity namespace; reject a duplicate with different data instead of
silently calling it delivered. Report the actual process killed, not an unexercised network fault.
See validation/06-outbox-delivery.md for source and exact learner-command evidence.

## Claim generation and receiver deduplication protect different outcomes (2026-09-05)

### What happened

Relay A holds its first claim transaction open while relay B commits a different event using
SKIP LOCKED. pgrowlocks observes one source tuple lock before A's COMMIT and zero afterward, while
both rows remain durably claimed at generation1. No source row lock spans receiver delivery.

After actual receiver/relay losses, a controlled deadline update represents expiry eligibility.
Core reclaims both messages at generation2; old-token source acknowledgements affect0 rows.
Already-credited2 retries with0 new effect, then3 adds11 and total reaches18. The after-source-ack
variation kills the relay only after source2's sent marker is independently visible. That message
stays sent at generation1; only3 is reclaimed at generation2. Final totals and complete payloads are
the same. An additional duplicate receipt adds0, and amount999 under event2's existing identity
raises22023/payload mismatch with no changes. Both ordinary server restarts preserve all two orders,
sent messages, receiver receipts and total18; new claims find no work.

### Why it matters

A generation check prevents a superseded claim from changing source completion. It does not prevent
that worker from contacting another resource. Receiver receipt/effect atomicity handles repeated
calls there. Conversely, deduplication does not make the source's ownership metadata correct.
Expiry permits takeover; the new generation takes effect when its claim commits. This fixture
represents expiry with an explicit timestamp update and does not measure a failure detector.

### How to apply

Commit claims briefly, preserve actual returned tokens and check ownership on acknowledgement.
Independently deduplicate immutable receiver events with retained receipts. Count attempts as the
operation actually measured: here committed claims, not every delivery call. State which failures
need retry and which already-committed source state suppresses it. Compare every order/event/receipt
payload and the receiver aggregate after recovery, not only a sent count. The guarantees apply to
these controlled writers and retained identities; they are not general exactly-once transport.
PostgreSQL references: [SELECT locking](https://www.postgresql.org/docs/16/sql-select.html#SQL-FOR-UPDATE-SHARE),
[INSERT conflict handling](https://www.postgresql.org/docs/16/sql-insert.html) and
[Read Committed](https://www.postgresql.org/docs/16/transaction-iso.html#XACT-READ-COMMITTED).

## A uniqueness wait does not refresh a combined lookup snapshot (2026-09-05)

### What happened

Current84 starts a real debit/receipt transaction and holds it uncommitted. A diagnostic
INSERT ON CONFLICT DO NOTHING RETURNING combined with a UNION ALL receipt SELECT actually waits on
that winner's transaction ID, verified with pg_stat_activity and pg_blocking_pids. After the winner
commits, the statement returns an empty array even though independent reads see the debit and
receipt. If the winner instead aborts, the insert-only diagnostic returns a null saved result; that
diagnostic is always rolled back, because it did not implement a business effect.

A complete PL/pgSQL VOLATILE function reserves the identity, performs the debit, records history and
stores its result in one caller transaction. On conflict it uses a separate SELECT, validates the
saved account/amount and returns the original result. Actual concurrent complete requests wait,
then return the same70 with one debit30. Another replay returns80 while current balance is75.
Changed account/amount and insufficient funds fail with full state unchanged.

### Why it matters

The uniqueness decision can depend on a transaction outside the original statement snapshot. A
CTE fallback does not create a fresh read boundary. Nor does inserting a receipt prove that a
charge happened: the debit and result must be included in the same protocol. Read Committed's new
command snapshot and VOLATILE function command visibility are the relevant PostgreSQL behaviors;
changing isolation or volatility changes the assumptions. See the primary
[Read Committed documentation](https://www.postgresql.org/docs/16/transaction-iso.html#XACT-READ-COMMITTED)
and [function volatility documentation](https://www.postgresql.org/docs/16/xfunc-volatility.html).

### How to apply

Gate the competing commit on an observed wait with the correct blocking PID, rather than assuming a
sleep produced overlap. Reproduce the failing combined query before showing the replacement. Use a
fresh statement/transaction at the correct isolation scope and bound retries; do not treat an empty
lookup as proof a request never committed. Inspect actual effects and stored answers, including a
later mutation that makes the current state differ from the original answer. Keep insert-only
diagnostic transactions rolled back, especially when the competing winner aborts.

## Retiring a result differs from forgetting its request identity (2026-09-05)

### What happened

The idempotency fixture kills two actual owned psql callers. The first has a returned function
result inside an uncommitted transaction; independent reads see no debit/receipt/history, and
SIGKILL plus backend exit rolls all changes back. A fresh request applies once. The other caller is
killed after an independent inventory proves commit; fresh replay returns its stored55 without
another debit. Forensic logs still contain results, so this is caller-process loss, not asserted
wire-response loss.

Deleting the receipt after an isolated debit9 leaves its balance91/history intact. Reuse debits9
again and reaches82, retaining two history rows for the same identity. A separate account instead
retires the receipt in place, keeping its primary key and payload while discarding the cached
answer. Reuse raises55000 and leaves balance91 with one debit. Both states remain distinct and fully
reconciled after a normal restart.

### Why it matters

An absent receipt cannot distinguish an unseen request from a forgotten committed request. Dedup
retention therefore defines the lifetime of the guarantee. Removing only cached response data can
preserve the admission guard, provided the function refuses reuse; it does not retain the old
response or bound the guard set. A separate check-then-insert tombstone table would introduce a new
coordination race unless designed transactionally.

### How to apply

Keep a deliberately duplicated business effect visible in its own account and history. Do not hide
it behind a second uniqueness constraint in the audit or include it in a generic success count.
Test retirement as an actual admission decision. Preserve identity/payload in the same unique row,
reject expired-result requests, and state how callers reconcile retained history. Arbitrary direct
writers can violate this controlled protocol; enforced role boundaries are a separate experiment.
Classify process-loss evidence from committed data, and distinguish normal restart from power-loss
recovery. Source/core/exact-hint records live in validation/06-idempotency.md.
