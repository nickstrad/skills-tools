# Checkpoint anatomy acceptance

Primary acceptance, 2026-09-05. Replaced current lesson 58, checkpoint-anatomy, at revision 4. The
self-contained shell driver owns a PostgreSQL 16 cluster, socket and retained evidence. No learner
cluster or progress mutation. Core and source variation ran serially, followed by an actual
copied-catalog pgcoach hint2 run.

## Runtime evidence

Core: /tmp/pg-checkpoint-core.log, owned directory /tmp/pg-owned-jmookzna. Variation:
/tmp/pg-checkpoint-variation.log, /tmp/pg-owned-tstr1adc. Driver: /tmp/pg-checkpoint-validate.ts and
extracted /tmp/pg-checkpoint-{core,variation}.sh.

| Observation                               | One update round | Two update rounds |
| ----------------------------------------- | ---------------: | ----------------: |
| Receipts / total amount                   |    2,000 / 2,000 |     2,000 / 4,000 |
| Heap HOT_UPDATE records                   |            2,000 |             4,000 |
| Measured transaction COMMIT records       |                1 |                 2 |
| Main heap dirty buffers before / after    |          223 / 0 |           223 / 0 |
| Main heap resident buffers before / after |        223 / 223 |         223 / 223 |
| Cluster buffers_checkpoint delta          |              246 |               246 |
| Requested / timed checkpoint delta        |            1 / 0 |             1 / 0 |
| Remaining WAL distance after checkpoint   |        176 bytes |         176 bytes |

The core page0 file LSN stays 0/8DD9A0 while its memory LSN advances to 0/A46568 and WAL flush
reaches 0/A4FFD0. After checkpoint, both page views report 0/A46568. The variation similarly
converges at 0/A6ED40. Correct receipt values and padding pass independently. The actual control
position decodes as XLOG CHECKPOINT_ONLINE; fresh logs identify manual checkpoint completion. All
private servers stopped, including the initial failed run's cluster.

The first run caught a missing observation boundary: the outcome scan generated hint-bit WAL later
than the update's synchronous commit. Added a separate marker commit before requiring flushed WAL to
cover the sampled page/interval. No disabled WAL protection or weakened assertion.

The 223 table pages, 246 cluster counter delta and 247-buffer log report are different scopes; the
lesson does not promise equality. Two rounds also produce 222 PRUNE records. More updates do not
require one checkpoint page write per update, but exact ratios remain layout/workload dependent.
File reads bypass shared buffers and can hit the OS cache; durability relies on PostgreSQL's
flush/checkpoint guarantees, with fsync/full_page_writes/synchronous_commit on. This is not a
power-failure test or a direct recovery-time measurement.

## Integration

Exact CLI hint: /tmp/pg-checkpoint-rendered-checkpoint-anatomy.md; output:
/tmp/pg-checkpoint-exact-checkpoint-anatomy.log. Its live assertions verify the same 4,000 updates /
2,000 receipts / amount 4,000 variation.

Thirty tests pass (/tmp/pg-checkpoint-tests.log); full repository check passes
(/tmp/pg-checkpoint-check.log). Isolated source build changes only checkpoint-anatomy; 94 lessons,
seven reading stops, original first seven and accepted capacity unchanged. Fresh copied catalog
/tmp/pg-observe-progress-vstg7h8m/progress.sqlite preserves all IDs, progress and attempts. Learner
DB hash during audit: 395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Scoped builder: /tmp/pg-checkpoint-scoped-build.py. Next: matched actual recovery trials at current
59; durability/restore and chunks 5–7 remain unfinished.
