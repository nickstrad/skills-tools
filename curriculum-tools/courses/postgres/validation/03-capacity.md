# Capacity experiment acceptance

Primary designed, implemented and validated this section sequentially on2026-09-05. It replaces
connection-saturation at revision4 with a bounded measured workload, rather than changing global
connection limits and restarting the cluster. The course remains94 lessons.

## Experiment and evidence

The driver runs1,2,4,8 closed-loop clients and repeats in reverse order,400 transactions per trial.
A fixed single pgbench thread avoids changing generator thread count with concurrency. Every
transaction increments one shared counter and holds its row lock for the configured duration. Each
trial checks pgbench exit status,400 successful per-transaction records, zero failures and 400
committed increments. Scoped activity samples provide observed lock-wait counts. The generated
schema is dropped, and raw records/settings/summaries/waits are retained in its evidence directory.

Both scripts were extracted from authoritative source or the exact rendered hint:

- Core: `/tmp/pg-capacity-core-20260905.sh`, output `/tmp/pg-capacity-core-20260905.log`, raw
  evidence `/tmp/pg-capacity-ebeu3oeq/`.
- Exact1ms variation: `/tmp/pg-capacity-variation-20260905.sh`, output
  `/tmp/pg-capacity-variation-20260905.log`, raw evidence `/tmp/pg-capacity-9bhs5l9e/`.

Both completed all eight trials with zero failures and all counter/log checks satisfied. Thus each
matrix executed3,200 verified transactions. The first prototype used min(2,clients) driver threads;
primary corrected that extra variable to one fixed thread and reran the final core and variation.

| Hold | Clients | Throughput range across two rounds | Empirical p99 range | Peak observed lock waiters |
| ---- | ------: | ---------------------------------: | ------------------: | -------------------------: |
| 5ms  |       1 |                    133.75–137.28/s |       10.43–13.78ms |                          0 |
| 5ms  |       2 |                    133.04–137.72/s |       27.95–37.47ms |                          1 |
| 5ms  |       4 |                    130.98–140.71/s |       68.41–75.15ms |                          3 |
| 5ms  |       8 |                    135.69–138.57/s |     172.54–196.54ms |                          7 |
| 1ms  |       1 |                    248.00–253.65/s |        8.42–13.82ms |                          0 |
| 1ms  |       2 |                    263.13–280.38/s |       12.35–13.48ms |                          1 |
| 1ms  |       4 |                    269.93–282.40/s |       35.78–39.33ms |                          3 |
| 1ms  |       8 |                    266.39–284.61/s |      97.74–104.69ms |                          7 |

These are measured local results, not acceptance thresholds or a general PostgreSQL capacity limit.
With400 samples, nearest-rank p99 selects the396th ordered latency. The driver does not represent an
independent arrival stream or an application queue; sampling competes for local resources and is not
a duration profile. The course's30ms exercise budget requires a decision supported by both observed
rounds, with explicit limits on generalization.

## Integration checks

Authoritative source/helper/guide format, lint and type checks pass; shell syntax checks pass. Build
resolves all backward prerequisites. Observability now follows checkpoints and precedes replication,
so the capacity experiment arrives before the long replication sequence while its I/O/recovery
prerequisites stay valid. The guide uses the supplied driver as its exact second hint. The standard
SQL harness skips shell lessons; its completion count is not used as capacity evidence.

Existing30 engine/validator/coaching tests pass. First seven built objects are unchanged; the course
keeps seven reading stops. Refresh on a copy preserves all original IDs, attempts and progress,
keeps first seven completed and selects lesson8. Actual learner progress remains untouched. Bounded
migration and remaining observability rewrites are still pending within chunk3.
