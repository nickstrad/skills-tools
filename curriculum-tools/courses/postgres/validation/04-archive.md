# Archive failure acceptance

Primary acceptance2026-09-05. Replaced wal-files-and-recycling (current55) at revision4 with an
owned archive failure and repair, supplied Python driver and exact20-segment coaching variation. No
existing cluster, learner port5440, progress, first7 or accepted capacity lesson was modified.

## Executed evidence

| Run              | Selected segments | Bytes retained with failure | Repaired receipts/amount | Archived count |
| ---------------- | ----------------- | --------------------------- | ------------------------ | -------------- |
| Core             | 12                | 13,631,488                  | 13/130                   | 13             |
| Source variation | 20                | 22,020,096                  | 21/210                   | 21             |
| Exact CLI hint2  | 20                | 22,020,096                  | 21/210                   | 21             |

All runs:8,388,608-byte soft WAL target; actual command exit1 and failed_count increase; all
selected ready markers and source files persist through a checkpoint while archive copies are
absent. Repair verifies every selected source/archive SHA-256 pair plus the extra wake segment's
archive presence. Markers disappear; another checkpoint removes every selected old name from pg_wal
in these runs. Final WAL directory8MB; count/sum assertions match the bounded workload. All private
servers stopped. Historical failed_count is not reset (1core,2source variation,1exact hint).

Raw logs: /tmp/pg-archive-core.log, /tmp/pg-archive-variation.log,
/tmp/pg-archive-exact-wal-files-and-recycling.log. Evidence directories respectively:
/tmp/pg-owned-v58r1tty, /tmp/pg-owned-_vm7ad0u, /tmp/pg-owned-o0y9fywy. Each retains data, archive,
settings/failure/repair JSON and server.log. Rendered hint:
/tmp/pg-archive-rendered-wal-files-and-recycling.md. Source scripts
/tmp/pg-archive-{core,variation}.sh; exact CLI driver /tmp/pg-archive-exact.ts/.sh. All observed
archive-command failures are deliberate; no unexpected SQL or process failure. Initial sandbox chown
rejection did not start a server; subsequent owned-cluster runs used authorized escalation.

## Review and integration

Primary designed, implemented, ran and reviewed the experiments. One bounded Terra/high read-only
review found no blocking defects. Primary adopted wording corrections distinguishing a rejected
archive command from a partial copy, driver timeouts from postmaster-launched commands, and book
segment coverage from archive API coverage. The local copy does not claim crash-durable storage,
host-loss survival, or restorability; those require later recovery experiments.

Thirty engine/validation/coaching tests pass (/tmp/pg-archive-tests.log); full repository check
passes (/tmp/pg-archive-check.log). Isolated actual build changes only wal-files-and-recycling,
with95 lessons, seven reading stops, unchanged first7/capacity and copied IDs/history/progress
preserved. Learner DB hash during verification:
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Scoped builder /tmp/pg-archive-scoped-build.py preserves the already published TOASTrev5 artifact
using the matching concurrently edited storage source. That source remains outside this acceptance
and unstaged; final integration must reconcile its owning workstream. No JSON fields hand-edited.
