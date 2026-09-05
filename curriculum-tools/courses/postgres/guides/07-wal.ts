import { CRASH_WORKLOAD_VARIATION } from "../curriculum/crash-workload.ts";
import { ARCHIVE_WORKLOAD_VARIATION } from "../curriculum/archive-workload.ts";
import { WAL_RECORDS_VARIATION } from "../curriculum/wal-records.ts";
import { WAL_PAGE_IMAGES_VARIATION } from "../curriculum/wal-page-images.ts";
import { COMMIT_WORKLOAD_VARIATION } from "../curriculum/commit-workload.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "crash-and-redo": {
    brief:
      "Use an actual owned-server crash to distinguish physical WAL replay, transaction decisions and visible application outcomes.",
    predict:
      "Both INSERTs have reached flushed WAL, but only the first transaction has committed. Which records, raw tuples and visible receipts should exist after the crash?",
    inspect:
      "Match both xids to INSERT records and the first xid to COMMIT. Check the stopped control state and fresh redo log, then compare the two physical tuple headers with the independent visible receipt query.",
    explain:
      "Why is an unfinished tuple physically present after recovery but absent from SELECT? What did the separate flush-marker transaction establish, and which failure boundaries were not exercised?",
    vary:
      "Commit the second transaction before the same crash. Predict its additional transaction record and final receipt totals, then compare both histories using the supplied fresh-cluster variation.",
    apply:
      "A service crashes after writing an order but before answering its caller. Specify the database and application evidence needed to decide whether retrying may create a duplicate. Which conclusions survive process failure but still need disk-loss recovery tests?",
    hints: [
      "Separate physical INSERT, transaction COMMIT, SQL-visible receipt and client acknowledgement. The script deliberately leaves the second client connected until after the core crash.",
      "Run this complete commit-before-crash variation in a shell.\n\n```bash\n" +
      CRASH_WORKLOAD_VARIATION + "\n```",
    ],
  },
  "wal-files-and-recycling": {
    brief:
      "Investigate the dependency between an archive consumer, retained WAL and a producer's disk budget using an owned failure and repair.",
    predict:
      "With a failed archive command, twelve sealed 1MB segments and an 8MB WAL target, what can a checkpoint reclaim? Which evidence would distinguish archive failure from an idle producer?",
    inspect:
      "Match failed_count, all twelve .ready markers, retained bytes and missing archive copies. After repair check each archived hash, the wake segment, old target-name disappearance through removal or recycling and the receipt totals.",
    explain:
      "Why can retained WAL exceed max_wal_size? Why is last_archived_wal alone insufficient proof that every required file arrived, and why does failed_count remain after repair?",
    vary:
      "Extend only the bounded outage workload from twelve to twenty sealed segments. Predict retained bytes and the final receipt count, then run the fresh-cluster variation.",
    apply:
      "An archive destination is unavailable and free disk is falling. Choose your next action using producer byte rate, retained history, repair time and the recovery guarantee you must preserve. What would prove the archive is usable after repair?",
    hints: [
      "Count required files and verify their bytes. A local archive copy does not prove independent host durability or a successful restore; the following recovery lessons cross those boundaries.",
      "Run this complete twenty-segment variation in a shell; it allocates and stops its own cluster.\n\n```bash\n" +
      ARCHIVE_WORKLOAD_VARIATION + "\n```",
    ],
  },
  "commit-means-fsync": {
    brief:
      "Compare waiting for a durability boundary with grouping useful work. Acknowledgement policy, transaction size and client concurrency are separate design choices.",
    predict:
      "With 400 independent counter increments, what might change when commit waiting is disabled or clients increase from one to four? Which outcome must remain fixed before any throughput comparison is meaningful?",
    inspect:
      "Validate every client counter and transaction-log count first. Compare both rounds' throughput, transaction p99 and WAL-write/sync deltas, using the recorded sync method and reset epochs.",
    explain:
      "Why can synchronous transactions share a flush? Why can an asynchronously committed row be visible while its crash durability remains unproven? What makes cluster WAL counters an imperfect denominator for this workload?",
    vary:
      "Group five increments into each transaction while keeping 400 total increments per trial and the same policy/client matrix. Compare useful increments per second and transaction latency, noting that only 80 latency samples remain per trial.",
    apply:
      "Choose a commit policy and batch size for reconstructible telemetry versus a job-completion receipt promised to a caller. Defend the acknowledgement contract, atomicity boundary and measurements you would require before deployment.",
    hints: [
      "Batch size changes transaction count, not the 400 useful increments. Compare increments_per_s; do not mistake fewer commits or fewer samples for less completed work or a stronger p99 estimate.",
      "Run this complete batch-five variation from a shell with the same lab PG connection variables.\n\n```bash\n" +
      COMMIT_WORKLOAD_VARIATION + "\n```",
    ],
  },
  "every-change-is-a-wal-record": {
    brief:
      "A physical log records work that recovery may need, including work from transactions that never commit. Use transaction identity and visible rows to distinguish those responsibilities.",
    predict:
      "Which WAL evidence should differ between a committed INSERT and a rolled-back INSERT? What extra observation is needed before calling either a successful business operation?",
    inspect:
      "Check flushed bounds and final row assertions, then match the measured xid to heap, B-tree and transaction records. For the read-side phase, match FPI_FOR_HINT blocks to the owned hint table.",
    explain:
      "Why does an aborted transaction consume WAL? Why can a SELECT generate physical WAL? Why is an LSN interval not an exact per-request accounting boundary?",
    vary:
      "Recreate the same fixture and change only the UPDATE target from amount to the indexed id. Predict HOT eligibility and index work; verify the intended new key and unchanged total row count.",
    apply:
      "A job processor aborts frequently under load. Specify the outcome and WAL measurements that distinguish correct rollback from low-cost execution, and choose which contention or retry behavior to investigate.",
    hints: [
      "Find the target xid's UPDATE/HOT_UPDATE and B-tree records. Then inspect the final row independently; the log is not a committed-result table.",
      "Run this complete indexed-key variation in one psql session.\n\n```sql\n" +
      WAL_RECORDS_VARIATION + "\n```",
    ],
  },
  "full-page-writes-after-checkpoint": {
    brief:
      "Recovery may need an entire valid page image before later changes can be replayed safely. Measure when that representation appears and how many bytes it adds.",
    predict:
      "For two successive updates of the same row, followed by a checkpoint and another update, where should image bytes appear? Which evidence would distinguish page-image cost from ordinary record overhead?",
    inspect:
      "Check the flushed bounds and three-increment invariant. Compare image_bytes across the three phases and match block_fpi_length/info to the owned heap page.",
    explain:
      "Why can first-touch bytes differ from exactly one full block? Why does compressing an image preserve a different guarantee from simply disabling full_page_writes?",
    vary:
      "Change only wal_compression from off to pglz on the fresh fixture. Keep full_page_writes enabled and compare the same three updates and final data result.",
    apply:
      "A write-heavy service generates a WAL burst after every checkpoint. Which page-reuse, compression-CPU, storage and recovery measurements would you gather before changing its policy?",
    hints: [
      "A first-touch image can omit free space or be compressed. Compare the actual block image metadata, not just the interval's total address-space movement.",
      "Run this complete compression variation in one psql session; it restores the prior session settings.\n\n```sql\n" +
      WAL_PAGE_IMAGES_VARIATION + "\n```",
    ],
  },
};
