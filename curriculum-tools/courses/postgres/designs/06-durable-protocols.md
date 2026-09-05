# Durable protocol implementation contract

Primary sequential work, 2026-09-05. Chunks1–5 are accepted in92 active lessons; the next surviving
identities are current83–87. This document plans the required replacement behavior. It does not
assert that these experiments have been implemented or validated. Keep the full scope from
REWORK-PLAN; finish each source, coaching, real-tool evidence and copied-catalog check before moving
on. No agents, port5440 operations or learner progress writes. Preserve unrelated storage edits.

## Existing evidence to build on

Current skip-locked-work-queue already teaches short committed claims, expiry eligibility and a
generation-checked local completion. It explicitly leaves external effects to later protocols.
unknown-commit-outcome/request-protocol.ts already supplies atomic local debit plus receipt, payload
agreement and result replay with a fresh Read Committed statement. Current79 has independent
receiver commit/source acknowledgement and actual source slot replay. Reuse their reasoning and
bounded process/SQL helpers without changing accepted embedded commands.

The old14-patterns.ts outbox prints PUBLISH and then rolls back; its inbox count is not an
independent business effect. Its idempotency example has a same-statement snapshot race, 2PC lacks a
durable coordinator decision, and fencing permits a missing-token bypass. The prior project review
identifies these exact deficiencies. Replace those behaviors rather than preserving their passing
output.

## Current83 transactional-outbox

- Initialize independent owned source and receiver PostgreSQL processes. Source business rows and
  immutable outbox identity/payload share one transaction. Hold an application transaction open,
  verify neither is visible independently, then kill its actual client and require neither survives.
  A successful application commit makes both visible with exactly matching business/event payloads.
- Relay ownership uses short committed SKIP LOCKED claims, owner/generation and bounded eligibility
  for retry. Actually overlap two claim transactions to prove distinct work/skip behavior. No row
  lock is held across independent receiver work. Reuse the durable-claim concept from the earlier
  queue lesson; it is not an external-resource fence.
- Receiver receipt identity and a measurable business mutation, such as crediting a total, commit
  atomically. A duplicate with the same immutable payload adds no effect; a mismatched payload must
  fail. Inspect receipts and the business result independently, not just row counts.
- Kill a receiver client before its commit and verify rollback with source acknowledgement absent.
  Separately let the receiver commit, verify that durable effect while the source is still unsent,
  then kill the sender/relay client before its acknowledgement. State the exact killed-process
  boundary; no simulated PUBLISH or claimed packet-loss mechanism substitutes for it.
- Recover eligible abandoned claims in a new generation. Replay the immutable message to the
  receiver, require zero duplicate business effect and then commit the source sent marker only with
  the matching generation. An old generation's acknowledgement must fail after takeover. If expiry
  is controlled by a fixture update, name it as a representation of elapsed time rather than
  claiming to have measured a crash detector; a real deadline may instead be used with bounded
  polling.
- Variation changes one meaningful failure boundary, such as loss after the source sent-marker
  commit. It must inventory source state and receiver effect and prove retry behavior without
  silently absorbing a deliberately lost effect into the safe result. Avoid adding a separate
  unrelated throughput/bloat exercise as the required variation.
- Final evidence joins every committed business row to one immutable outbox message, every sent
  message to its independently committed receiver receipt/effect, and the receiver aggregate to its
  receipt sum. Failed application work remains absent. Retain raw process/transaction evidence and
  clean up all owned clients/servers. Do not claim general exactly-once delivery or free CDC writes.

## Current84 idempotency-keys

Retain identity/payload/effect/result as one protocol, beyond an ON CONFLICT receipt insert.
Exercise actual concurrent duplicate requests, commit/rollback outcomes and the old combined
insert-or-select snapshot race. A competing conflict can win after that statement's snapshot and
yield no result; correct recovery must use a properly scoped fresh statement/transaction with a
bounded policy. Verify atomic business mutation plus stored result, same-payload replay,
mismatched-payload rejection and unknown-response recovery. Explicitly test retention: removing a
receipt can make a later reuse look new, so state the identity lifetime and admission policy. Do not
modify the accepted earlier request lesson merely to share implementation; a complete standalone
fixture may embed its logic.

## Current85 two-phase-commit

Introduce actual prepared participants, visible prepared-transaction state and blocked competing
work. Then implement the missing durable coordinator stage with independent participant commits and
a separately persisted decision. A SQLite decision log with explicit full durability is a possible
small local coordinator; two PostgreSQL processes remain independent participants. Record stable
operation/GID identity and participant outcome receipts, rather than interpreting missing prepared
state as proof of commit.

Core persists COMMIT before final participant decisions, kills the actual coordinator client/process
at a controlled incomplete-finalization boundary, and recovers from that durable decision. Resolve
remaining prepared work and verify full debit/credit invariants and no duplicate effects. A
variation loses the coordinator before any commit decision is durable and applies an explicit
durable ABORT recovery policy before resolving participants. Prove blocking while undecided and
final absence of prepared transactions/locks. Distinguish recovery of this known participant set
from a general consensus, heuristic-resolution or network-partition protocol.

## Current86 fencing-tokens-with-a-monotonic-counter

Make the protected resource enforce tokens through an actual interface. Application roles must lack
direct DML on protected state; the provided function/interface requires a non-null explicit epoch,
validates it and atomically changes the resource only when authorized. Qualify SECURITY DEFINER
references and grants if used. Exercise stale completion, omitted/null-token calls and direct-DML
bypass attempts with the restricted role, not only superuser calls supplying good arguments.

Separate claim/takeover from resource acceptance of a newer epoch. Demonstrate the precise point at
which the old worker becomes fenced at that resource, and test the ordering before and after it.
Verify every accepted/rejected operation and final data. A lease or claim number alone cannot
protect an independent resource that has not learned the newer fence. Keep the resource protocol and
its failure/authority assumptions explicit; do not call a local counter an election algorithm.

## Current87 listen-notify-as-a-bus

Retain actual listener disconnection and missed notification, but finish recovery from durable table
state. Commit work and NOTIFY together, verify rollback leaves neither committed work nor an
accepted notification, and show that notification payload/count is not the durable work inventory.
Register LISTEN with a committed boundary and use the documented listen-then-scan sequence to close
startup races. Kill/disconnect the actual listener, commit work while it is absent,
reconnect/register and poll/reconcile every pending job. Verify resulting business state/receipts
and no skipped work even when wake-ups are missed or coalesced. The notification is a hint to
inspect durable state, not the business effect or the queue's authoritative offset. Bound
listener/client processes and cleanup.

## Integration and acceptance

Write standalone owned fixtures for lifecycle/failure work. New modules/helpers must not mutate
accepted commands or leave implicit shared state. Add guides/14-patterns.ts and register it with
specific predict/inspect/explain/vary/apply prompts and complete executable hint2 commands. Keep
surviving slugs, course revision2 and changed lesson revision4; any consolidation needs measured
replacement coverage and explicit identity/prerequisite/reading maps before retiring a lesson.

Run every core, source variation and exact rendered hint against the actual local tools,
sequentially for process/recovery operations. Inspect outcomes and expected errors independently of
success markers. Build from the authoritative sources while preserving unrelated generated content;
run 30 existing tests/full checks and copied progress migration. Record durable findings and
per-lesson validation, keep the handoff current, then commit/push each accepted subsection. Disk is
low: verify and cold-archive only explicitly identified stopped owned evidence before allocating
more pairs, preserving logs/manifests and checking complete archive/original file hashes.

Chunk7 incidents and the final whole-course audit remain after these protocols. Do not mark the full
goal complete after this design or after any one protocol lesson.
