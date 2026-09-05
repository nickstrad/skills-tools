# Recovery cost acceptance

Primary acceptance, 2026-09-05. Current 59 redo-point-bounds-recovery is revision 4, with matched
actual crashes on four fresh owned clusters per run. Pair order reverses on the second pass. Every
trial has the same bulk dataset and common committed tail; only the extra checkpoint after the bulk
differs within each pair.

## Live evidence

Source core: /tmp/pg-recovery-cost-core.log and comparison /tmp/pg-recovery-cost-8o42t9hj. Source
variation: /tmp/pg-recovery-cost-variation.log and /tmp/pg-recovery-cost-lejfu7lh. Each comparison
directory retains trial logs and results.json, which names all owned cluster paths. Each cluster
retains stopped control, offline WAL dump and fresh recovery log.

| Bulk rows / condition   | Recovery address distance | Decoded records | Client-ready ms (two trials) | Domain-verified ms |
| ----------------------- | ------------------------: | --------------: | ---------------------------- | ------------------ |
| 20,000 / old checkpoint |                 6,859,696 |          40,075 | 352.95, 556.83               | 436.93, 651.65     |
| 20,000 / recent         |                    38,840 |              11 | 252.20, 356.69               | 363.66, 448.81     |
| 40,000 / old checkpoint |                13,641,464 |          80,130 | 452.68, 448.17               | 595.39, 568.67     |
| 40,000 / recent         |                    36,704 |              11 | 246.75, 247.87               | 373.52, 372.79     |

Core outcomes: 20,001 distinct receipts, IDs 1–20,001, total amount 200,010,007. Variation: 40,001
distinct receipts, IDs 1–40,001, total amount 800,020,007. All individual amounts and payloads
match, equal heap sizes and settings pass, and all source clusters stopped. Old ranges include
40,057/80,112 bulk transaction records; recent ranges include none. All ranges include the tail's
three records, including INSERT and COMMIT. Actual logs require interrupted state, recovery
start/done and readiness. Stopped control redo matches log redo start; offline final record start
matches log redo done. Timeline remains unchanged and pg_is_in_recovery is false.

Initial trial failed the final-record comparison because a buffer observation generated hint WAL
after the saved end. The driver now performs all instrumentation before the tail commit, which
flushes its observer history too. SQL/log and pg_waldump also format hexadecimal leading zeroes
differently; comparisons normalize those addresses. The resolved failure's cluster
/tmp/pg-owned-e2in22hc is stopped.

Log redo durations were 0.04–0.05s versus 0.00s for core and 0.09s versus 0.00s for variation. A
printed zero is rounded, not absence of replay. pg_ctl readiness polling, subprocess startup,
end-of-recovery checkpoint and fresh SQL contribute to client-ready costs. Domain timing adds a full
result check and recovery/timeline checks. These are cached local process-failure samples, with no
fixed speed-ratio assertion. The expected end-of-valid-WAL log diagnostic (invalid record length or
unexpected page address in a recycled segment) is not classified as failed recovery: saved flushed
history is decoded and matched to actual redo completion and independent rows.

## Integration

Exact copied-catalog variation: /tmp/pg-recovery-cost-rendered-redo-point-bounds-recovery.md and
/tmp/pg-recovery-cost-exact-redo-point-bounds-recovery.log. Four further real crashes verify the
40,001-receipt result and both checkpoint conditions. The rendered variation comes from pgcoach
current 59 hint2, not direct source-only validation.

Thirty tests and full repository check pass (/tmp/pg-recovery-cost-tests.log and
/tmp/pg-recovery-cost-check.log). Isolated build changes only current 59; 94 lessons, seven reading
stops, original first seven and accepted capacity remain intact. Fresh copied catalog
/tmp/pg-observe-progress-mdmbmyiy/progress.sqlite preserves all IDs, progress and attempts. Learner
progress hash during audit is unchanged:
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Builders/drivers: /tmp/pg-recovery-cost-scoped-build.py, /tmp/pg-recovery-cost-validate.ts and
/tmp/pg-recovery-cost-exact.ts. Next: current 60 WAL-pressure checkpoints, then
backup/restore/missing-WAL and PITR.
