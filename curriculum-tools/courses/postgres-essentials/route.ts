/** Fixed scope; entries beyond the built catalog are planned, not runnable lessons. */
export const ROUTE = [
  {
    "slug": "committed-row-visibility",
    "title": "An uncommitted write is private to its transaction",
  },
  {
    "slug": "statement-versus-transaction-snapshot",
    "title": "Choose a fresh statement view or a stable transaction view",
  },
  {
    "slug": "old-reader-retains-history",
    "title": "An old reader can prevent vacuum from removing history",
  },
  {
    "slug": "reusable-space-versus-file-size",
    "title": "Reusable space is different from a smaller file",
  },
  {
    "slug": "lost-update-and-atomic-write",
    "title": "Lose an update, then keep arithmetic in the database",
  },
  {
    "slug": "row-lock-protects-decision",
    "title": "Protect a read-modify-write decision with a row lock",
  },
  {
    "slug": "reject-stale-edit",
    "title": "Reject a stale edit with a version check",
  },
  {
    "slug": "multi-row-write-skew",
    "title": "Two valid decisions can break one shared rule",
  },
  {
    "slug": "serializable-protects-invariant",
    "title": "Make the conflicting decision fail under Serializable",
  },
  {
    "slug": "whole-transaction-retry",
    "title": "Retry a known-aborted transaction from the beginning",
  },
  {
    "slug": "unknown-commit-outcome",
    "title": "A lost response leaves the commit outcome unknown",
  },
  {
    "slug": "durable-request-identity",
    "title": "Reconcile a repeated request by its durable identity",
  },
  {
    "slug": "find-the-blocker",
    "title": "Find the transaction controlling a wait",
  },
  {
    "slug": "deadlock-cycle",
    "title": "Cause a deadlock and explain the cycle",
  },
  {
    "slug": "timeout-and-transaction-state",
    "title": "A deadline does not always end the transaction",
  },
  {
    "slug": "read-a-plan-as-evidence",
    "title": "Read a plan as measured work",
  },
  {
    "slug": "statistics-and-estimates",
    "title": "Repair a misleading row estimate",
  },
  {
    "slug": "index-crossover",
    "title": "An index can stop being the cheaper path",
  },
  {
    "slug": "composite-index-order",
    "title": "Match an index to filtering and ordering",
  },
  {
    "slug": "index-only-needs-visibility",
    "title": "Covering the columns is only half an index-only scan",
  },
  {
    "slug": "sort-spill",
    "title": "Make a sort spill, then bring it back into memory",
  },
  {
    "slug": "join-memory",
    "title": "A join adds another memory consumer",
  },
  {
    "slug": "commit-and-wal",
    "title": "Connect commit acknowledgement to durable log work",
  },
  {
    "slug": "wal-per-useful-write",
    "title": "Measure WAL per useful operation",
  },
  {
    "slug": "checkpoint-writeback",
    "title": "A checkpoint writes pages without ending transactions",
  },
  {
    "slug": "crash-replay",
    "title": "Reconcile committed and aborted work after a crash",
  },
  {
    "slug": "restore-and-verify",
    "title": "Prove a backup can restore the intended data",
  },
  {
    "slug": "recovery-needs-history",
    "title": "Recovery can fail when one required segment is missing",
  },
  {
    "slug": "targeted-recovery",
    "title": "Recover to a chosen point and account for excluded work",
  },
  {
    "slug": "build-a-standby",
    "title": "Build and verify a streaming standby",
  },
  {
    "slug": "received-is-not-replayed",
    "title": "Received WAL is not yet visible data",
  },
  {
    "slug": "bounded-read-your-writes",
    "title": "Give a replica read a bounded freshness guarantee",
  },
  {
    "slug": "synchronous-acknowledgement",
    "title": "Choose what a synchronous acknowledgement waits for",
  },
  {
    "slug": "connection-capacity",
    "title": "More clients can produce more waiting instead of more work",
  },
  {
    "slug": "bounded-online-change",
    "title": "Keep a schema change from becoming an unbounded queue",
  },
  {
    "slug": "transactional-outbox",
    "title": "Commit business state and pending delivery together",
  },
  {
    "slug": "receiver-effect-before-ack",
    "title": "Commit the receiver effect before acknowledging delivery",
  },
  {
    "slug": "recover-abandoned-claim",
    "title": "Make abandoned work eligible again",
  },
  {
    "slug": "investigate-an-unfamiliar-incident",
    "title": "Choose evidence before seeing an incident’s cause",
  },
  {
    "slug": "intervene-and-verify",
    "title": "Verify that the remedy restored correct useful work",
  },
] as const;
