# Durable protocol integration acceptance

Primary acceptance, 2026-09-05. Chunk6 is complete through current87 in92 active lessons. Chunk7
incidents and the final whole-course audit remain required; this is not completion of the full
pivot.

## Executed protocol coverage

| Current | Required boundary and measured result                                                                                                                                                      | Acceptance record                                    |
| ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
|      83 | Source business/outbox atomicity, independent receiver credit, actual relay loss after receiver commit, generation-checked acknowledgement and deduplicated recovery to18                  | [Outbox delivery](06-outbox-delivery.md)             |
|      84 | Actual combined-lookup snapshot race, payload/effect/result atomicity, concurrent replay, caller loss and receipt-retention failure versus retained-key refusal                            | [Idempotency](06-idempotency.md)                     |
|      85 | Detached prepared locks/horizon and participant crash, separately durable coordinator decision, partial finalization, actual coordinator loss and COMMIT/ABORT recovery with full outcomes | [Two-phase commit](06-two-phase-commit.md)           |
|      86 | Real restricted roles, explicit token/ownership checks, direct-write bypass rejection and the resource-commit point that fences a waiting old worker                                       | [Resource fencing](06-resource-fencing.md)           |
|      87 | Committed LISTEN before fresh scan, source rollback/coalescing, actual listener loss and recovery of all durable work despite missed/redundant notifications                               | [Notification recovery](06-notification-recovery.md) |

Every lesson has individually executed core, source variation and exact rendered-hint evidence.
Experiments initialize their own state, name actual process/transaction boundaries and preserve
complete domain outcomes. Existing surviving slugs remain; all five revisions are4 and course
revision remains2. Earlier version-column and replica-readiness patterns retain their accepted
placement/prerequisites in the concurrent-client and replication blocks. No additional identity is
retired in chunk6, and canonical optional-reading citations are preserved.

## Consistent assumptions across lessons

The earlier queue lesson's committed claims/generations protect local completion. Current83 applies
that model to source acknowledgements while an independent receiver transaction protects credit
against replay. Source sent status and receiver effects are separate commits; an unsent source row
can coexist with a durable receiver effect. Current84 makes the request identity/payload/result
contract explicit, including fresh observation after a uniqueness wait and the duplicate effect that
forgotten identity can permit. Its unsafe retention account remains visible as failure evidence.

Current85 uses a committed coordinator decision to finish a registered prepared operation. It checks
full participant receipts instead of interpreting absent GIDs as commit proof, and keeps
partial75/100 visibility explicit before the final75/125 result. Current86 enforces a resource epoch
through real role boundaries; it does not confuse newly issued ownership with a resource that has
already accepted a fence. A committed old-token write before the new fence remains in the
variation's history. Same-epoch writes still require separate idempotency when a caller retries
them.

Current87 uses notifications only to prompt durable scans. Receipt/credit/completion share one local
transaction, so killing the actual listener rolls them back together. Recovering five jobs from one
new wake-up demonstrates why signalling cannot replace the work inventory. An external API effect
would need current83's independent receiver/acknowledgement treatment, rather than inheriting local
transaction atomicity from the listener example.

These are independently initialized teaching fixtures, not one jointly deployed end-to-end service.
Their assumptions are connected and reviewed here; chunk7 still supplies independent diagnosis and
final workload integration. Controlled writers, retained identities/decisions, known authority and
one-host lab scope remain explicit. Fencing's restricted interface is tested as a role boundary;
other controlled SQL fixtures do not claim arbitrary direct-writer enforcement. No local counter or
known-dead coordinator takeover is described as election, consensus or partition tolerance.

## Current artifact and outcome correspondence

/tmp/pg-chunk6-artifact-audit.py compares every current built core with its retained executed
core.sh, allowing only the builder's final-newline trim. It freshly renders all five hint2 commands
against copied progress and requires exact equality with source variation.sh and cached previously
executed rendered fences. All five match. It checks15 execution logs for their expected completion
line and absence of Python tracebacks, then inspects saved domain inventories and boundary records:

- Outbox: two committed orders, two sent messages with complete matching payloads, two receiver
  receipts and credit18; the recorded relay-loss boundary matches core/variation.
- Idempotency: full account histories reconcile55/70/82/91, including two deliberately repeated
  unsafe-retention debits, retained-key retirement and the distinct empty/null CTE outcomes.
- 2PC: complete COMMIT or ABORT payload/GID/participant/receipt/balance records survive repeated
  recovery, with the observed durable decision preceding remaining resolution.
- Fencing: complete epoch/writer/value history has four core or five variation rows, ending B-final
  at epoch2, with recorded restricted privileges and separated claim/resource authority.
- Notifications: all six complete jobs/receipts reconcile credit72, with five recovered jobs/one new
  wake-up and actual listener loss. The startup notification count matches the varied boundary.

[Evidence manifest](06-evidence-manifest.json) records complete hashes for scripts, all15 logs,
selected checked JSON inventories/boundaries and the preserved database images. Original data
directories still present are independently stopped/status3/no PID. Earlier cold archives are
checked against their recorded verified archival SHA256, file-manifest hashes/counts and clean
control records. This confirms unchanged preserved images, not a database restore. Detailed
permission/error/transaction interpretation remains in the individual reports and their audits; a
success marker alone is not used to support those claims.

This integration check does not rerun historical experiments. It establishes correspondence between
current commands and previously executed/reviewed evidence, and rechecks recorded domain outcomes.
Current87 core, source variation and exact hint were newly executed for this acceptance.
Current83–85 images are in verified cold archives; current86–87 retain stopped original data
directories.

Thirty engine/coaching tests and full format/lint/typecheck pass. Current87's scoped build changes
only that object; copied migration preserves all existing IDs, attempts/progress, original
first-seven objects/current completions, capacity semantics and seven reading stops. Learner
progress hash is unchanged; the current87 report names the exact logs/copy. Unrelated storage
source/guide/knowledge edits and root bin/ remain outside this commit.

## Remaining full-goal work

Author the chunk7 implementation contract and replace current88–92 with symptom-first incidents and
final operation-history/capacity integration according to REWORK-PLAN and the prior project review.
The whole-course audit must cover all explicit requirements, including earlier idle insertion/replay
and abort-only WAL flush boundaries, final ordering/readings/wrapper behavior and complete progress
preservation. Do not mark the active goal complete after chunk6.
