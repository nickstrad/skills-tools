# Replication and change-processing integration acceptance

Primary acceptance, 2026-09-05. Chunk5 is complete through current82. Chunks6–7 and the final
whole-course audit remain required; this is not completion of the full pivot.

## Executed coverage

| Current | Experiment                                                                    | Acceptance record                                         |
| ------: | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
|      69 | Independent streaming standby, verified backup and receiver restart           | [Standby](05-standby.md)                                  |
|      70 | Received/flushed versus paused apply, complete catch-up                       | [Replay lag](05-replay-lag.md)                            |
|      71 | Same-history read-your-writes gate, timeout and primary fallback              | [Readiness](05-replica-readiness.md)                      |
|      72 | Remote flush/apply waits and actual transaction outcomes                      | [Synchronous acknowledgement](05-sync-acknowledgement.md) |
|      73 | Actual recovery conflict, feedback horizon and reclamation                    | [Standby conflicts](05-standby-conflicts.md)              |
|      74 | Retained physical history, replay and invalidation/reinitialization           | [Slot retention](05-slot-retention.md)                    |
|      75 | Preserved split-brain evidence and controlled fenced promotion                | [Failover](05-failover-workload.md)                       |
|      76 | Actual rewind, chosen authority and discarded-branch inventory                | [Rewind](05-rewind-workload.md)                           |
|      77 | Controlled failback and optional measured cascade                             | [Failback](05-failback-workload.md)                       |
|      78 | Physical/logical commit/abort, schema and live delivery ordering              | [Decoding](05-logical-decoding.md)                        |
|      79 | Independent receiver effects, acknowledgement loss and deduplicated replay    | [Delivery](05-slot-delivery.md)                           |
|      80 | Audited COPY/tail for creation and refresh with ongoing existing-table stream | [Bootstrap](05-logical-bootstrap.md)                      |
|      81 | Actual uniqueness/schema failures and complete repair/skip reconciliation     | [Conflicts](05-logical-conflicts.md)                      |
|      82 | Slot removal/recreation, ineffective refresh and actual state resnapshot      | [Resnapshot](05-logical-resnapshot.md)                    |

Every row has real core, source-variation and exact rendered-hint execution evidence in its report.
The experiments initialize isolated state and clean up their own processes/slots; they do not
require a predecessor to leave a live shared topology. Current80 consolidates retired
initial-sync-vs-streaming only after both original and new-table handoffs were measured. The
physical read-your-writes identity was moved with its prerequisites and reading map preserved.
Current course is92 lessons/seven stops.

## Current artifact correspondence

/tmp/pg-chunk5-artifact-audit.py compared all14 current built core scripts with their retained
executed core.sh files. It freshly rendered every hint2 against copied progress and compared its
bash fence with both the source variation.sh and previously executed rendered hint. All match. It
also checked the42 retained core/variation/exact logs for their success marker and absence of a
Python traceback. [Evidence manifest](05-evidence-manifest.json) records complete SHA256 values for
scripts and logs. Outcome interpretation and expected errors remain in the individual reports; a
marker alone is not treated as proof of their claims.

This correspondence check does not rerun all historical experiments. It establishes that the current
commands still match the previously executed and reviewed artifacts. The new current82 core, source
variation and exact hint were run again during this acceptance. No shared topology is assumed
between independently initialized lessons.

Thirty engine/coaching tests and full format/lint/typecheck pass. The current82 scoped build changes
only that lesson. Copied migration preserves existing IDs, attempts and progress, original first
seven lesson objects, unchanged capacity semantics and seven reading stops. Real learner progress
hash remains unchanged. See the current82 report for exact logs/copy path. Unrelated storage source,
guide, knowledge edits and root bin/ remain outside this commit.

## Remaining full-goal work

Chunk6 must implement durable outbox/receiver effects, idempotency boundaries, recoverable 2PC
decisions, enforced fencing and missed-notification reconciliation in current83–87. Chunk7 supplies
symptom-first incidents and the final operation-history/capacity integration. Whole-course audit
still checks all explicit requirements, including earlier idle insertion/replay and abort-only WAL
flush boundaries, final ordering/readings/wrapper and complete progress preservation. Independent
processes on one host are not independent host failure domains or a general election service.
