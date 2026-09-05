# Idempotency, snapshot races and retention acceptance

Primary acceptance, 2026-09-05. Current84 idempotency-keys is revision4. The standalone private
PostgreSQL16 fixture replaces the insert-only payment example with atomic receipt, payload check,
account debit, history and saved result. It reproduces the previous combined lookup's concurrent
snapshot failure and separates deliberately unsafe receipt deletion from correct replay outcomes.

## Actual request boundaries

/tmp/pg-idempotency-protocol-validate.ts executes source core and variation in separate owned
clusters. Scripts/logs: /tmp/pg-idempotency-protocol-{core,variation}.{sh,log}. Core root
/tmp/pg-owned-8070t6ty; variation /tmp/pg-owned-flhszqqr. Configuration JSON records
PostgreSQL16.15, Read Committed, fsync/synchronous_commit/full_page_writes on and each system
identifier. Each root retains full JSON inventories, persistent client logs and server.log.

The first winner executes apply_debit('race',1,20) inside BEGIN and holds its transaction. An
independent inventory still shows all four balances100 and no receipts/history. The diagnostic
loser's combined INSERT ON CONFLICT DO NOTHING RETURNING plus UNION ALL SELECT starts while that
winner is uncommitted. pg_stat_activity actually observes Lock/transactionid, with pg_blocking_pids
naming the winner. Core's waiter626817 blocks on626800; variation's627151 blocks on627134.

Core commits the winner: the diagnostic returns[] despite an independently visible receipt/answer80
and one debit20. Its uniqueness decision includes the committed rival, but its statement SELECT
snapshot cannot. Variation rolls the winner back: the diagnostic inserts a temporary receipt and
returns one balance_after=NULL row; independently all balances remain100 and no history exists. Both
diagnostic transactions explicitly roll back. No insert-only fragment is committed as a valid
business operation. Fresh apply_debit then returns80 with exactly one committed debit20 in either
run. A later debit5 produces current balance75, while replay of race returns the original80 without
changing any table.

A second overlapping trial uses the complete VOLATILE function for both clients. The loser waits on
the winner's XID, then returns70 using the function's separate SQL SELECT after the winner commits.
Account2 has one debit30/receipt. Actual changed-amount and changed-account calls each fail22023;
insufficient funds fail22003. Full before/after inventories agree, including absence of a too-large
receipt/history, proving rollback of the function's earlier insert when its debit fails.

lost-before's real psql caller logs65 inside BEGIN, while independent reads still show75 and no
receipt/history for that request. Its backend is idle in transaction with an XID (core735,
variation737). SIGKILL produces client exit-9; backend disappearance and unchanged full state prove
rollback. Fresh retry then commits one debit10 and returns65. lost-after actually commits debit10
and receipt/result55; its backend is idle without an XID, and an independent full inventory confirms
commit before SIGKILL. Those rows survive process loss. Fresh same-key replay returns55 and changes
nothing. These are actual caller-process-loss boundaries classified by a forensic parent, not a
claim that a network packet was dropped; the retained client logs can contain responses.

## Retention and final reconciliation

The isolated unsafe-retention request debits account3 from100 to91. Deleting only its receipt leaves
that debit/history intact. Reuse of exactly the same key/account/amount then debits again to82 and
stores the new answer82; history retains both debit9 rows and answers91/82. The audit table has no
unique request_id, deliberately allowing this business failure to be observed instead of masked.

retained-guard debits account4 to91. In-place retirement keeps its primary key and payload, changes
status to retired and drops the cached result. Same-payload replay actually fails55000; no second
debit occurs. This policy retains identities indefinitely and refuses expired-result requests;
reconciliation may consult retained history. It does not offer bounded identity storage, an old
cached answer, or safety after the guard itself is deleted.

Final account balances are55/70/82/91. Seven receipts and eight committed history rows reconcile
every identity/payload, intermediate debit result and starting100-minus-history balance. The extra
unsafe account3 debit stays visible as deliberate failure evidence. The account1 safe chain
is20/5/10/10; account2 has one30; account4 has one9. Identity sequence gaps after aborted
transactions vary; the comparison uses request identities and complete domain values, not assumed
contiguous IDs.

A normal server stop/start retains full state and system identity. Replay of race still returns80
while current account1 balance is55; the retired key again fails55000. Cleanup reaps all six
persistent callers (four normal exits and two-9) and stops the private server. No real learner
cluster or port5440 is used. Normal restart is not a host power-loss test.

## Exact commands, integration and limits

/tmp/pg-idempotency-protocol-exact.ts renders pgcoach84 hint2 from copied catalog
/tmp/pg-observe-progress-eo6t6u_o/progress.sqlite. Exact Markdown:
/tmp/pg-idempotency-protocol-rendered-idempotency-keys.md; executed log:
/tmp/pg-idempotency-protocol-exact-idempotency-keys.log; root /tmp/pg-owned-0yptn0r5. It reproduces
the winner-rollback variation, proper concurrent replay, both actual process losses,
payload/business errors, deliberate duplicate debit, retained-guard refusal and complete
post-restart inventory. The built core matches its executed script modulo the builder's
final-newline trim; the rendered fence exactly matches the executed source variation. The retained
/tmp/pg-idempotency-protocol-audit.py verifies these comparisons. All three servers independently
report pg_ctl status3/no PID. Each log has exactly five expected SQL errors: two payload mismatches,
one insufficient balance and two retired identity refusals; no unexpected FATAL/PANIC or remaining
owned caller is present.

/tmp/pg-idempotency-protocol-scoped-build.py builds from authoritative source in isolated
/tmp/pg-idempotency-protocol-build-cwvoh7ct and changes only current84 among92 generated lessons.
The unrelated storage source already represented in the old artifact is included only to preserve
that content, and is not staged. The lesson slug and course revision2 survive; no identities retire.
Specific coaching prompts and the complete variation are registered in guides/14-patterns.ts. Copied
progress migration preserves all IDs/history/progress, original first-seven full lesson objects and
current completions, capacity semantics and seven reading stops. Learner SHA256 stays
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6. Thirty tests and the full
format/lint/typecheck pass; logs /tmp/pg-idempotency-protocol-{tests,check}.log.

The guarantee applies to controlled writers that use apply_debit, preserve identity/payload and
retain guards. Direct SQL can bypass it, as the deliberate deletion trial shows. VOLATILE's separate
SQL commands provide the fresh Read Committed lookup; moving the whole protocol under a retained
higher-isolation snapshot needs transaction-level recovery. Python's retry helper bounds40001 to
three fresh implicit transactions; no unavailable-receipt retry is required by these successful
runs. It rejects other failures immediately. This is one database's atomic effect, not an external
payment or general exactly-once transport. Findings:
docs/knowledge/postgres-durable-protocol-evidence.md.
